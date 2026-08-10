# Recovery Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend PayTrack with recovery targets + scorecards, an escalation ladder, and an AI-assisted daily recovery plan with WhatsApp digests, per `docs/superpowers/specs/2026-07-21-recovery-backend-design.md`.

**Architecture:** New Prisma models on the existing Supabase schema; pure logic in `lib/recovery/*` (vitest-tested, no DB imports); Claude API behind `lib/ai/*` with a rules fallback; one new `CRON_SECRET`-authed cron route; thin server-component pages. Recovery scoring **reuses the existing `lib/ar/risk.ts` engine** (`riskScore`, `buildRiskInput`) instead of introducing a second threshold system — its `RiskLevel` CRITICAL/HIGH/MEDIUM/LOW already matches the spec's buckets.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma → Supabase Postgres (`prisma db push`, no migrations dir), Supabase Auth, vitest, Zod, Anthropic Messages API (`claude-haiku-4-5`), existing WhatsApp Cloud API provider.

**Spec deviations (both discovered during codebase recon, both improvements):**
1. Scoring reuses `lib/ar/risk.ts` (0–100 explainable score + RiskLevel) rather than re-implementing RecoveryAI's flat thresholds. DRY; already tested.
2. `Message.partyId` is required, so staff digests cannot log to `Message` (digests go to staff, not parties). The cron logs one `SyncLog` row (new `SyncType.RECOVERY_CRON`) with a details JSON instead.

**Conventions used throughout (match existing code):**
- DB client: `import { db } from "@/lib/db"`
- Auth: `requireProfile()` / `requireAdmin()` / `canAccessParty()` from `@/lib/authz`
- Money: Prisma `Decimal` in DB; pure modules take `number` (callers convert with `Number()`)
- Tests: `lib/<area>/__tests__/<name>.test.ts`, run with `npx vitest run <path>`
- Commit after every task.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | 4 new models, 2 new enums, 1 enum value, back-relations |
| `prisma/sql/2026-07-21-escalation-open-unique.sql` (create) | Partial unique index (one OPEN escalation per party) |
| `lib/recovery/escalation.ts` (create) | Pure: auto-flag rules, stage ladder order |
| `lib/recovery/targets.ts` (create) | Pure: IST month windows, pace math |
| `lib/recovery/plan.ts` (create) | Pure: daily chase-list builder, bucket-slip detection |
| `lib/recovery/digest.ts` (create) | Pure: digest text rendering |
| `lib/ai/schema.ts` (create) | Pure: recommendation JSON schema + tolerant parser |
| `lib/ai/fallback.ts` (create) | Pure: rules-based recommendation from RiskResult |
| `lib/ai/claude.ts` (create) | Anthropic API call, prompt caching, retry-once |
| `lib/recovery/recommend.ts` (create) | DB glue: context assembly → Claude/fallback → upsert |
| `lib/recovery/run.ts` (create) | DB glue: cron steps (auto-flag, refresh recs, digest assembly) |
| `lib/messaging/internal.ts` (create) | Staff-facing WhatsApp send (documented gate exception) |
| `lib/validation.ts` (modify) | Zod schemas for targets + escalation actions |
| `app/(dashboard)/targets/actions.ts` + `page.tsx` (create) | Target CRUD (admin) + scorecard page |
| `app/(dashboard)/escalations/actions.ts` + `page.tsx` (create) | Escalation ladder actions + queue page |
| `app/(dashboard)/recovery/page.tsx` (create) | Today's chase list |
| `app/api/cron/recovery/route.ts` (create) | Cron: flag → recs → digests, SyncLog row |
| `vercel.json` (modify) | Second cron entry |
| `app/(dashboard)/_components/sidebar.tsx` (modify) | 3 nav links |
| `.env.example`, `README.md` (modify) | `ANTHROPIC_API_KEY` |

---

### Task 1: Prisma schema — models, enums, index SQL

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/sql/2026-07-21-escalation-open-unique.sql`

- [ ] **Step 1: Add enums and the SyncType value**

In `prisma/schema.prisma`, add to the enums section (near `enum SyncStatus`):

```prisma
enum EscalationStage {
  FLAGGED
  NOTICE
  FINAL_NOTICE
  LEGAL
}

enum EscalationStatus {
  OPEN
  RESOLVED
  DISMISSED
}
```

And add `RECOVERY_CRON` to the existing `enum SyncType`:

```prisma
enum SyncType {
  IMPORT_PARTIES
  IMPORT_INVOICES
  IMPORT_PAYMENTS
  FULL_IMPORT
  EXPORT_PAYMENTS
  RECOVERY_CRON
}
```

- [ ] **Step 2: Add the four models** (end of schema file)

```prisma
model RecoveryTarget {
  id           String   @id @default(cuid())
  userId       String   @db.Uuid
  month        DateTime // canonical label: Date.UTC(y, m, 1) for the IST month
  targetAmount Decimal  @db.Decimal(12, 2)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user Profile @relation("RecoveryTargetUser", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, month])
}

model Escalation {
  id         String           @id @default(cuid())
  partyId    String
  stage      EscalationStage  @default(FLAGGED)
  status     EscalationStatus @default(OPEN)
  reason     String // which auto-flag rule fired, or the manual reason
  openedById String?          @db.Uuid // null = auto-flagged by cron
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  party    Party             @relation(fields: [partyId], references: [id], onDelete: Restrict)
  openedBy Profile?          @relation("EscalationOpener", fields: [openedById], references: [id])
  events   EscalationEvent[]

  @@index([status, stage])
  @@index([partyId])
}

model EscalationEvent {
  id           String           @id @default(cuid())
  escalationId String
  fromStage    EscalationStage?
  toStage      EscalationStage
  note         String
  byId         String?          @db.Uuid // null = system (cron)
  createdAt    DateTime         @default(now())

  escalation Escalation @relation(fields: [escalationId], references: [id], onDelete: Cascade)
  by         Profile?   @relation("EscalationEventActor", fields: [byId], references: [id])

  @@index([escalationId, createdAt])
}

model Recommendation {
  id          String   @id @default(cuid())
  partyId     String   @unique
  content     Json // { nextAction, urgency, talkingPoints, draftMessage }
  model       String // "claude-haiku-4-5" | "rules-fallback"
  generatedAt DateTime @default(now())

  party Party @relation(fields: [partyId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Add back-relations**

On `model Profile` (next to the existing relation list):

```prisma
  recoveryTargets  RecoveryTarget[]  @relation("RecoveryTargetUser")
  openedEscalations Escalation[]     @relation("EscalationOpener")
  escalationEvents EscalationEvent[] @relation("EscalationEventActor")
```

On `model Party` (next to its relation list):

```prisma
  escalations    Escalation[]
  recommendation Recommendation?
```

- [ ] **Step 4: Create the partial-index SQL file**

`prisma db push` cannot express partial indexes. Create `prisma/sql/2026-07-21-escalation-open-unique.sql`:

```sql
-- One OPEN escalation per party. Run once per Supabase project
-- (SQL editor or psql) after `npm run db:push`.
-- App code also guards this in a transaction; the index is the backstop.
CREATE UNIQUE INDEX IF NOT EXISTS "Escalation_partyId_open_key"
  ON "Escalation" ("partyId")
  WHERE status = 'OPEN';
```

- [ ] **Step 5: Validate and generate**

Run: `npx prisma validate && npx prisma generate`
Expected: both succeed. (Do NOT run `db:push` unless a dev Supabase is configured in `.env.local`; if it is, run `npm run db:push` and then execute the SQL file in the Supabase SQL editor.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/sql/2026-07-21-escalation-open-unique.sql
git commit -m "feat: recovery schema — targets, escalations, recommendations"
```

---

### Task 2: `lib/recovery/escalation.ts` — auto-flag rules + stage ladder

**Files:**
- Create: `lib/recovery/escalation.ts`
- Test: `lib/recovery/__tests__/escalation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { shouldAutoFlag, nextStage } from "../escalation";

describe("shouldAutoFlag", () => {
  it("does not flag below both thresholds", () => {
    expect(
      shouldAutoFlag({ outstanding: 49_999, maxDaysOverdue: 59, brokenPromises: 1 })
    ).toEqual({ flag: false });
  });

  it("flags at exactly 60 days overdue AND ₹50,000", () => {
    const v = shouldAutoFlag({ outstanding: 50_000, maxDaysOverdue: 60, brokenPromises: 0 });
    expect(v.flag).toBe(true);
    if (v.flag) expect(v.reason).toContain("60");
  });

  it("does not flag 60 days overdue with small outstanding", () => {
    expect(
      shouldAutoFlag({ outstanding: 10_000, maxDaysOverdue: 200, brokenPromises: 0 })
    ).toEqual({ flag: false });
  });

  it("does not flag large outstanding that is not yet 60d overdue", () => {
    expect(
      shouldAutoFlag({ outstanding: 900_000, maxDaysOverdue: 59, brokenPromises: 1 })
    ).toEqual({ flag: false });
  });

  it("flags on 2+ broken promises regardless of amount", () => {
    const v = shouldAutoFlag({ outstanding: 5_000, maxDaysOverdue: 0, brokenPromises: 2 });
    expect(v.flag).toBe(true);
    if (v.flag) expect(v.reason.toLowerCase()).toContain("promise");
  });
});

describe("nextStage", () => {
  it("walks the ladder in order and stops at LEGAL", () => {
    expect(nextStage("FLAGGED")).toBe("NOTICE");
    expect(nextStage("NOTICE")).toBe("FINAL_NOTICE");
    expect(nextStage("FINAL_NOTICE")).toBe("LEGAL");
    expect(nextStage("LEGAL")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recovery/__tests__/escalation.test.ts`
Expected: FAIL — cannot resolve `../escalation`.

- [ ] **Step 3: Implement**

```ts
// Pure escalation rules — no DB access, unit-tested.
import type { EscalationStage } from "@prisma/client";

export type EscalationRuleInput = {
  outstanding: number;
  maxDaysOverdue: number;
  brokenPromises: number;
};

export type EscalationVerdict = { flag: false } | { flag: true; reason: string };

// Pilot thresholds — tune after 1-2 weeks of real data.
const MIN_OVERDUE_DAYS = 60;
const MIN_OUTSTANDING = 50_000;
const MIN_BROKEN_PROMISES = 2;

export function shouldAutoFlag(input: EscalationRuleInput): EscalationVerdict {
  if (input.brokenPromises >= MIN_BROKEN_PROMISES) {
    return {
      flag: true,
      reason: `${input.brokenPromises} broken promises to pay`,
    };
  }
  if (input.maxDaysOverdue >= MIN_OVERDUE_DAYS && input.outstanding >= MIN_OUTSTANDING) {
    return {
      flag: true,
      reason: `₹${Math.round(input.outstanding).toLocaleString("en-IN")} outstanding, oldest invoice ${input.maxDaysOverdue} days overdue`,
    };
  }
  return { flag: false };
}

const LADDER: EscalationStage[] = ["FLAGGED", "NOTICE", "FINAL_NOTICE", "LEGAL"];

/** Next stage up the ladder, or null when already at LEGAL. */
export function nextStage(stage: EscalationStage): EscalationStage | null {
  const i = LADDER.indexOf(stage);
  return i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recovery/__tests__/escalation.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/recovery/escalation.ts lib/recovery/__tests__/escalation.test.ts
git commit -m "feat: escalation auto-flag rules and stage ladder"
```

---

### Task 3: `lib/recovery/targets.ts` — IST month windows + pace

**Files:**
- Create: `lib/recovery/targets.ts`
- Test: `lib/recovery/__tests__/targets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { istMonthKey, istMonthWindow, monthProgress, pace } from "../targets";

// 2026-07-01T00:00 IST == 2026-06-30T18:30Z
const JULY_KEY = new Date(Date.UTC(2026, 6, 1));

describe("istMonthKey", () => {
  it("uses the IST month, not the UTC month, near midnight", () => {
    // 2026-06-30T20:00Z is already 2026-07-01 01:30 IST
    expect(istMonthKey(new Date(Date.UTC(2026, 5, 30, 20, 0)))).toEqual(JULY_KEY);
    // 2026-06-30T17:00Z is still 2026-06-30 22:30 IST
    expect(istMonthKey(new Date(Date.UTC(2026, 5, 30, 17, 0)))).toEqual(
      new Date(Date.UTC(2026, 5, 1))
    );
  });
});

describe("istMonthWindow", () => {
  it("returns UTC instants of IST month boundaries", () => {
    const { start, end } = istMonthWindow(JULY_KEY);
    expect(start.toISOString()).toBe("2026-06-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });
});

describe("monthProgress", () => {
  it("is ~0 at month start and ~1 at month end", () => {
    expect(monthProgress(new Date("2026-06-30T18:30:00.000Z"))).toBeCloseTo(0, 5);
    expect(monthProgress(new Date("2026-07-31T18:29:00.000Z"))).toBeCloseTo(1, 2);
  });
});

describe("pace", () => {
  const midJuly = new Date("2026-07-16T06:30:00.000Z"); // exactly half the month gone

  it("reports on-track when collection matches elapsed time", () => {
    const r = pace(100_000, 50_000, midJuly);
    expect(r.actualPct).toBeCloseTo(0.5, 2);
    expect(r.expectedPct).toBeCloseTo(0.5, 2);
    expect(r.onTrack).toBe(true);
    expect(r.projectedTotal).toBeCloseTo(100_000, -2);
  });

  it("reports behind when collection lags badly", () => {
    const r = pace(100_000, 10_000, midJuly);
    expect(r.onTrack).toBe(false);
  });

  it("handles a zero target without dividing by zero", () => {
    const r = pace(0, 5_000, midJuly);
    expect(r.actualPct).toBe(0);
    expect(r.onTrack).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recovery/__tests__/targets.test.ts`
Expected: FAIL — cannot resolve `../targets`.

- [ ] **Step 3: Implement**

```ts
// Pure IST month-window and pace math — no DB access, unit-tested.
// India has a single fixed offset (+05:30, no DST), so a constant is correct.

const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Canonical month label for a moment in time: Date.UTC(y, m, 1) of the month
 * that moment falls in **in IST**. Stored as RecoveryTarget.month.
 */
export function istMonthKey(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1));
}

/** UTC instants where the labelled IST month starts and ends. */
export function istMonthWindow(monthKey: Date): { start: Date; end: Date } {
  const y = monthKey.getUTCFullYear();
  const m = monthKey.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS),
  };
}

/** Fraction of the current IST month elapsed, clamped to [0, 1]. */
export function monthProgress(now: Date): number {
  const { start, end } = istMonthWindow(istMonthKey(now));
  const frac = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
  return Math.min(Math.max(frac, 0), 1);
}

export type PaceResult = {
  actualPct: number; // collected / target (0 when target is 0)
  expectedPct: number; // fraction of month elapsed
  projectedTotal: number; // linear projection to month end
  onTrack: boolean; // within 5 percentage points of expected
};

const PACE_TOLERANCE = 0.05;

export function pace(target: number, collected: number, now: Date): PaceResult {
  const expectedPct = monthProgress(now);
  const actualPct = target > 0 ? collected / target : 0;
  const projectedTotal = expectedPct > 0 ? collected / expectedPct : collected;
  const onTrack = target <= 0 || actualPct >= expectedPct - PACE_TOLERANCE;
  return { actualPct, expectedPct, projectedTotal, onTrack };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recovery/__tests__/targets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/recovery/targets.ts lib/recovery/__tests__/targets.test.ts
git commit -m "feat: IST month windows and target pace math"
```

---

### Task 4: `lib/recovery/plan.ts` — daily chase-list builder

**Files:**
- Create: `lib/recovery/plan.ts`
- Test: `lib/recovery/__tests__/plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildDailyPlan, bucketSlip, type PlanParty } from "../plan";

function party(overrides: Partial<PlanParty>): PlanParty {
  return {
    partyId: "p1",
    partyName: "Sharma Traders",
    phone: "9876543210",
    assignedToId: "staff-1",
    outstanding: 100_000,
    score: 50,
    reasons: [],
    ...overrides,
  };
}

describe("bucketSlip", () => {
  it("detects an invoice about to cross into the next aging bucket", () => {
    expect(bucketSlip(25)).toEqual({ daysToSlip: 6, nextBucket: "31–60 days" });
    expect(bucketSlip(-3)).toEqual({ daysToSlip: 4, nextBucket: "0–30 days" });
  });
  it("returns null deep inside 90+ (no further bucket)", () => {
    expect(bucketSlip(95)).toBeNull();
  });
  it("returns null when the slip is more than 7 days away", () => {
    expect(bucketSlip(35)).toBeNull(); // next transition at 61 → 26 days away
  });
});

describe("buildDailyPlan", () => {
  it("groups by assigned staff and routes unassigned to the admin list", () => {
    const plan = buildDailyPlan([
      party({ partyId: "a", assignedToId: "s1", reasons: [{ kind: "promise_due", promiseDate: new Date(), promiseAmount: 5000 }] }),
      party({ partyId: "b", assignedToId: null, reasons: [{ kind: "stale_high_risk", daysSinceLastAction: 20 }] }),
    ]);
    expect(plan.byStaff.get("s1")).toHaveLength(1);
    expect(plan.unassigned).toHaveLength(1);
  });

  it("orders by reason weight (promise > slip > stale > top-up), then score", () => {
    const plan = buildDailyPlan([
      party({ partyId: "top", score: 99, reasons: [] }),
      party({ partyId: "stale", score: 10, reasons: [{ kind: "stale_high_risk", daysSinceLastAction: 15 }] }),
      party({ partyId: "promise", score: 5, reasons: [{ kind: "promise_due", promiseDate: new Date(), promiseAmount: null }] }),
    ]);
    const ids = (plan.byStaff.get("staff-1") ?? []).map((p) => p.partyId);
    expect(ids).toEqual(["promise", "stale", "top"]);
  });

  it("adds top_score reason only to reason-less parties within topN", () => {
    const plan = buildDailyPlan(
      [party({ partyId: "x", reasons: [] }), party({ partyId: "y", score: 1, reasons: [] })],
      { topN: 1 }
    );
    const entries = plan.byStaff.get("staff-1") ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0].partyId).toBe("x");
    expect(entries[0].reasons[0].kind).toBe("top_score");
  });

  it("returns empty structures for no input", () => {
    const plan = buildDailyPlan([]);
    expect(plan.byStaff.size).toBe(0);
    expect(plan.unassigned).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recovery/__tests__/plan.test.ts`
Expected: FAIL — cannot resolve `../plan`.

- [ ] **Step 3: Implement**

```ts
// Pure daily-plan builder — no DB access, unit-tested.
// DB glue (lib/recovery/run.ts) assembles PlanParty[] and calls buildDailyPlan.

import { AGING_LABELS, agingBucket } from "@/lib/ar/aging";

export type PlanReason =
  | { kind: "promise_due"; promiseDate: Date; promiseAmount: number | null }
  | { kind: "bucket_slip"; invoiceRef: string; daysToSlip: number; nextBucket: string }
  | { kind: "stale_high_risk"; daysSinceLastAction: number }
  | { kind: "top_score" };

export type PlanParty = {
  partyId: string;
  partyName: string;
  phone: string | null;
  assignedToId: string | null;
  outstanding: number;
  score: number; // riskScore().score
  reasons: PlanReason[];
};

export type DailyPlan = {
  byStaff: Map<string, PlanParty[]>; // profileId → chase list
  unassigned: PlanParty[]; // admin's list
};

const SLIP_HORIZON_DAYS = 7;
// Aging-bucket transitions in days-overdue terms (see lib/ar/aging.ts).
const TRANSITIONS = [1, 31, 61, 91];

/** Days until this invoice crosses into the next aging bucket, if within 7 days. */
export function bucketSlip(
  daysOverdue: number
): { daysToSlip: number; nextBucket: string } | null {
  const next = TRANSITIONS.find((t) => t > daysOverdue);
  if (next === undefined) return null;
  const daysToSlip = next - daysOverdue;
  if (daysToSlip > SLIP_HORIZON_DAYS) return null;
  // Bucket the invoice will be in after the transition.
  const future = new Date();
  future.setDate(future.getDate() - next);
  return { daysToSlip, nextBucket: AGING_LABELS[agingBucket(future)] };
}

const REASON_WEIGHT: Record<PlanReason["kind"], number> = {
  promise_due: 4,
  bucket_slip: 3,
  stale_high_risk: 2,
  top_score: 1,
};

function strongestWeight(p: PlanParty): number {
  return Math.max(0, ...p.reasons.map((r) => REASON_WEIGHT[r.kind]));
}

export function buildDailyPlan(
  parties: PlanParty[],
  opts: { topN: number } = { topN: 10 }
): DailyPlan {
  // Top-up: the highest-scoring reason-less parties get a top_score reason.
  const reasonless = parties
    .filter((p) => p.reasons.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.topN);
  for (const p of reasonless) p.reasons.push({ kind: "top_score" });

  const included = parties.filter((p) => p.reasons.length > 0);
  included.sort((a, b) => strongestWeight(b) - strongestWeight(a) || b.score - a.score);

  const byStaff = new Map<string, PlanParty[]>();
  const unassigned: PlanParty[] = [];
  for (const p of included) {
    if (p.assignedToId === null) {
      unassigned.push(p);
    } else {
      const list = byStaff.get(p.assignedToId) ?? [];
      list.push(p);
      byStaff.set(p.assignedToId, list);
    }
  }
  return { byStaff, unassigned };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recovery/__tests__/plan.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/recovery/plan.ts lib/recovery/__tests__/plan.test.ts
git commit -m "feat: daily recovery plan builder with bucket-slip detection"
```

---

### Task 5: `lib/recovery/digest.ts` — digest text rendering

**Files:**
- Create: `lib/recovery/digest.ts`
- Test: `lib/recovery/__tests__/digest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderStaffDigest, renderAdminDigest } from "../digest";
import type { DailyPlan, PlanParty } from "../plan";

const entry: PlanParty = {
  partyId: "p1",
  partyName: "Sharma Traders",
  phone: "9876543210",
  assignedToId: "s1",
  outstanding: 125_000,
  score: 70,
  reasons: [{ kind: "promise_due", promiseDate: new Date("2026-07-21"), promiseAmount: 50_000 }],
};

describe("renderStaffDigest", () => {
  it("lists parties with amount and reason", () => {
    const text = renderStaffDigest("Ravi", [entry], new Date("2026-07-21"));
    expect(text).toContain("Ravi");
    expect(text).toContain("Sharma Traders");
    expect(text).toContain("1,25,000");
    expect(text.toLowerCase()).toContain("promise");
  });

  it("says all clear when there is nothing to chase", () => {
    const text = renderStaffDigest("Ravi", [], new Date("2026-07-21"));
    expect(text.toLowerCase()).toContain("no follow-ups");
  });
});

describe("renderAdminDigest", () => {
  it("summarises per staff member with totals", () => {
    const plan: DailyPlan = { byStaff: new Map([["s1", [entry]]]), unassigned: [entry] };
    const text = renderAdminDigest(plan, new Map([["s1", "Ravi"]]), new Date("2026-07-21"));
    expect(text).toContain("Ravi: 1");
    expect(text).toContain("Unassigned: 1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recovery/__tests__/digest.test.ts`
Expected: FAIL — cannot resolve `../digest`.

- [ ] **Step 3: Implement**

```ts
// Pure, deterministic digest text — templates only, no LLM (spec §3).
import { formatINR, formatDate } from "@/lib/format";
import type { DailyPlan, PlanParty, PlanReason } from "./plan";

function reasonLabel(r: PlanReason): string {
  switch (r.kind) {
    case "promise_due":
      return r.promiseAmount
        ? `promised ${formatINR(r.promiseAmount)} by ${formatDate(r.promiseDate)}`
        : `promise due ${formatDate(r.promiseDate)}`;
    case "bucket_slip":
      return `inv ${r.invoiceRef} slips to ${r.nextBucket} in ${r.daysToSlip}d`;
    case "stale_high_risk":
      return `high risk, no contact for ${r.daysSinceLastAction}d`;
    case "top_score":
      return "top outstanding";
  }
}

const MAX_LINES = 10;

export function renderStaffDigest(
  staffName: string,
  entries: PlanParty[],
  date: Date
): string {
  const header = `PayTrack — ${formatDate(date)}\n${staffName}, today's follow-ups:`;
  if (entries.length === 0) {
    return `${header}\nNo follow-ups due today. All clear.`;
  }
  const lines = entries
    .slice(0, MAX_LINES)
    .map(
      (e, i) =>
        `${i + 1}. ${e.partyName} — ${formatINR(e.outstanding)} (${reasonLabel(e.reasons[0])})`
    );
  const more = entries.length > MAX_LINES ? `\n…and ${entries.length - MAX_LINES} more in the app.` : "";
  return `${header}\n${lines.join("\n")}${more}`;
}

export function renderAdminDigest(
  plan: DailyPlan,
  staffNames: Map<string, string>,
  date: Date
): string {
  const rows: string[] = [];
  let total = 0;
  for (const [staffId, entries] of plan.byStaff) {
    rows.push(`${staffNames.get(staffId) ?? staffId}: ${entries.length}`);
    total += entries.length;
  }
  if (plan.unassigned.length > 0) {
    rows.push(`Unassigned: ${plan.unassigned.length}`);
    total += plan.unassigned.length;
  }
  const top = [...plan.unassigned, ...[...plan.byStaff.values()].flat()]
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 3)
    .map((e) => `• ${e.partyName} ${formatINR(e.outstanding)}`);
  return [
    `PayTrack recovery digest — ${formatDate(date)}`,
    `${total} follow-ups today.`,
    ...rows,
    top.length ? `Biggest exposure:\n${top.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recovery/__tests__/digest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/recovery/digest.ts lib/recovery/__tests__/digest.test.ts
git commit -m "feat: deterministic WhatsApp digest templates"
```

---

### Task 6: `lib/ai/schema.ts` + `lib/ai/fallback.ts` — parser and rules fallback

**Files:**
- Create: `lib/ai/schema.ts`, `lib/ai/fallback.ts`
- Test: `lib/ai/__tests__/schema.test.ts`, `lib/ai/__tests__/fallback.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/ai/__tests__/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRecommendation } from "../schema";

const valid = {
  nextAction: "Call the owner about the ₹50,000 promise",
  urgency: "today",
  talkingPoints: ["Promise was due Monday", "Offer UPI link"],
  draftMessage: "Namaste Sharma ji, aapka payment pending hai…",
};

describe("parseRecommendation", () => {
  it("parses a clean JSON string", () => {
    expect(parseRecommendation(JSON.stringify(valid))).toEqual(valid);
  });

  it("parses JSON inside a markdown fence with prose around it", () => {
    const raw = "Here you go:\n```json\n" + JSON.stringify(valid) + "\n```\nHope that helps!";
    expect(parseRecommendation(raw)).toEqual(valid);
  });

  it("rejects an invalid urgency value", () => {
    expect(parseRecommendation(JSON.stringify({ ...valid, urgency: "someday" }))).toBeNull();
  });

  it("rejects garbage", () => {
    expect(parseRecommendation("I cannot help with that.")).toBeNull();
  });
});
```

`lib/ai/__tests__/fallback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rulesFallback } from "../fallback";

describe("rulesFallback", () => {
  it("maps CRITICAL risk to a today-urgency visit recommendation", () => {
    const rec = rulesFallback(
      { score: 85, level: "CRITICAL", reasons: ["Oldest unpaid invoice is 200 days overdue"] },
      { partyName: "Sharma Traders", outstanding: 600_000, maxDaysOverdue: 200 }
    );
    expect(rec.urgency).toBe("today");
    expect(rec.talkingPoints.length).toBeGreaterThan(0);
    expect(rec.draftMessage).toContain("Sharma Traders");
  });

  it("maps LOW risk to this_month", () => {
    const rec = rulesFallback(
      { score: 10, level: "LOW", reasons: [] },
      { partyName: "Kale Hardware", outstanding: 8_000, maxDaysOverdue: 5 }
    );
    expect(rec.urgency).toBe("this_month");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ai`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/ai/schema.ts`**

```ts
// Recommendation content shape + tolerant parser for LLM output.
import { z } from "zod";

export const recommendationContentSchema = z.object({
  nextAction: z.string().min(1),
  urgency: z.enum(["today", "this_week", "this_month"]),
  talkingPoints: z.array(z.string().min(1)).min(1).max(5),
  draftMessage: z.string().min(1),
});

export type RecommendationContent = z.infer<typeof recommendationContentSchema>;

/** Strip markdown fences / surrounding prose, then find the outermost object. */
function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export function parseRecommendation(raw: string): RecommendationContent | null {
  try {
    const parsed = recommendationContentSchema.safeParse(
      JSON.parse(extractJsonObject(raw))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement `lib/ai/fallback.ts`**

```ts
// Deterministic recommendation when Claude is unconfigured or fails.
// The pilot never blocks on AI (spec §3).
import type { RiskResult } from "@/lib/ar/risk";
import { formatINR } from "@/lib/format";
import type { RecommendationContent } from "./schema";

export type FallbackContext = {
  partyName: string;
  outstanding: number;
  maxDaysOverdue: number;
};

export function rulesFallback(
  risk: Pick<RiskResult, "score" | "level" | "reasons">,
  ctx: FallbackContext
): RecommendationContent {
  const urgency =
    risk.level === "CRITICAL" ? "today" : risk.level === "HIGH" ? "this_week" : "this_month";
  const nextAction =
    risk.level === "CRITICAL"
      ? `Visit or call the owner today — ${formatINR(ctx.outstanding)} stuck ${ctx.maxDaysOverdue} days`
      : risk.level === "HIGH"
        ? "Call this week and push for a dated payment commitment"
        : "Send a polite payment reminder with the outstanding statement";
  return {
    nextAction,
    urgency,
    talkingPoints: risk.reasons.length > 0 ? risk.reasons.slice(0, 5) : ["Routine follow-up"],
    draftMessage: `Namaste ${ctx.partyName}, aapke account par ${formatINR(ctx.outstanding)} outstanding hai. Kripya payment jaldi arrange karein. – PayTrack`,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/ai`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/ai/schema.ts lib/ai/fallback.ts lib/ai/__tests__
git commit -m "feat: recommendation schema, tolerant parser, rules fallback"
```

---

### Task 7: `lib/ai/claude.ts` — Anthropic API call

> Implementation note (from spec §3): invoke the **claude-api skill** before writing this file to confirm current API/caching details. The code below is the expected shape; the skill may refine header versions or caching syntax.

**Files:**
- Create: `lib/ai/claude.ts`

No unit test for the network call itself (parsing and fallback are already tested); keep this file free of logic beyond transport.

- [ ] **Step 1: Implement**

```ts
// Anthropic Messages API transport — server-only. All parsing lives in
// schema.ts; all fallback logic in fallback.ts; DB glue in lib/recovery.
import { captureError } from "@/lib/monitoring";
import { parseRecommendation, type RecommendationContent } from "./schema";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = "claude-haiku-4-5";

export type PartyAiContext = {
  name: string;
  outstanding: number;
  maxDaysOverdue: number;
  brokenPromises: number;
  riskLevel: string;
  creditDays: number | null;
  openInvoices: { number: string; pending: number; daysOverdue: number }[];
  recentPayments: { date: string; amount: number; method: string }[];
  recentActions: { date: string; type: string; outcome: string | null; notes: string | null }[];
};

// Static instructions — cached across calls via cache_control.
const SYSTEM_PROMPT = `You are a credit-collections advisor for an Indian MSME distributor. Customers are small shops and traders buying on 30-60 day credit. Recommend the single next best collection action for the given customer. Be direct, specific, and culturally aware (Indian B2B, Hinglish WhatsApp drafts are fine).

Respond with ONLY a JSON object, no prose, exactly this shape:
{"nextAction": string, "urgency": "today"|"this_week"|"this_month", "talkingPoints": string[] (1-5 items), "draftMessage": string (a short WhatsApp message to the customer)}`;

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function callOnce(context: PartyAiContext): Promise<string | null> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: JSON.stringify(context) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return data.content?.find((b) => b.type === "text")?.text ?? null;
}

/** One retry on malformed output, then null — caller falls back to rules. */
export async function generatePartyRecommendation(
  context: PartyAiContext
): Promise<RecommendationContent | null> {
  if (!claudeConfigured()) return null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await callOnce(context);
      if (raw) {
        const parsed = parseRecommendation(raw);
        if (parsed) return parsed;
      }
    }
    return null;
  } catch (e) {
    await captureError(e, { scope: "ai.recommendation" });
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/claude.ts
git commit -m "feat: Claude API transport with prompt caching and retry"
```

---

### Task 8: `lib/recovery/recommend.ts` — recommendation DB glue

**Files:**
- Create: `lib/recovery/recommend.ts`

- [ ] **Step 1: Implement**

```ts
// Assemble AI context from the DB, call Claude (or fall back), cache result.
import { subMonths } from "date-fns";
import { db } from "@/lib/db";
import { buildRiskInput } from "@/lib/ar/refresh";
import { riskScore } from "@/lib/ar/risk";
import { daysOverdue } from "@/lib/ar/aging";
import { generatePartyRecommendation, CLAUDE_MODEL, type PartyAiContext } from "@/lib/ai/claude";
import { rulesFallback } from "@/lib/ai/fallback";

const HISTORY_MONTHS = 6;
const HISTORY_LIMIT = 10;

export async function refreshRecommendation(partyId: string): Promise<void> {
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return;

  const since = subMonths(new Date(), HISTORY_MONTHS);
  const [riskInput, invoices, payments, actions] = await Promise.all([
    buildRiskInput(party),
    db.invoice.findMany({
      where: { partyId, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
      orderBy: { dueDate: "asc" },
      take: HISTORY_LIMIT,
      select: { invoiceNumber: true, totalAmount: true, paidAmount: true, dueDate: true },
    }),
    db.payment.findMany({
      where: { partyId, paymentDate: { gte: since } },
      orderBy: { paymentDate: "desc" },
      take: HISTORY_LIMIT,
      select: { paymentDate: true, amount: true, method: true },
    }),
    db.action.findMany({
      where: { partyId, performedAt: { gte: since } },
      orderBy: { performedAt: "desc" },
      take: HISTORY_LIMIT,
      select: { performedAt: true, type: true, outcome: true, notes: true },
    }),
  ]);

  const risk = riskScore(riskInput);
  const context: PartyAiContext = {
    name: party.name,
    outstanding: riskInput.outstanding,
    maxDaysOverdue: riskInput.maxDaysOverdue,
    brokenPromises: riskInput.brokenPromises,
    riskLevel: risk.level,
    creditDays: party.creditDays,
    openInvoices: invoices.map((i) => ({
      number: i.invoiceNumber,
      pending: Number(i.totalAmount) - Number(i.paidAmount),
      daysOverdue: Math.max(daysOverdue(i.dueDate), 0),
    })),
    recentPayments: payments.map((p) => ({
      date: p.paymentDate.toISOString().slice(0, 10),
      amount: Number(p.amount),
      method: p.method,
    })),
    recentActions: actions.map((a) => ({
      date: a.performedAt.toISOString().slice(0, 10),
      type: a.type,
      outcome: a.outcome,
      notes: a.notes,
    })),
  };

  const aiContent = await generatePartyRecommendation(context);
  const content =
    aiContent ??
    rulesFallback(risk, {
      partyName: party.name,
      outstanding: riskInput.outstanding,
      maxDaysOverdue: riskInput.maxDaysOverdue,
    });

  await db.recommendation.upsert({
    where: { partyId },
    create: {
      partyId,
      content,
      model: aiContent ? CLAUDE_MODEL : "rules-fallback",
    },
    update: {
      content,
      model: aiContent ? CLAUDE_MODEL : "rules-fallback",
      generatedAt: new Date(),
    },
  });
}
```

> If `Invoice` field names differ (`invoiceNumber`, `totalAmount`, `paidAmount`), check `prisma/schema.prisma` `model Invoice` and adjust the `select` accordingly — do this before running the type check.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (fix any field-name mismatches against the real schema).

- [ ] **Step 3: Commit**

```bash
git add lib/recovery/recommend.ts
git commit -m "feat: recommendation refresh — AI context assembly with rules fallback"
```

---

### Task 9: `lib/messaging/internal.ts` — staff WhatsApp send

**Files:**
- Create: `lib/messaging/internal.ts`

- [ ] **Step 1: Implement**

```ts
// Staff-facing WhatsApp sends (daily digests). This is the ONE documented
// exception to "everything goes through sendReminder()": digests go to our
// own staff, not to parties, so the consent gate and Message audit row do
// not apply. Failures are logged by the caller (cron SyncLog).
//
// Meta caveat: free-form text only lands inside the 24h service window —
// each staff member must message the business number once to open it.
// Delivery failure is acceptable: the digest is always visible at /recovery.
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { createWhatsAppProvider } from "./providers/whatsapp";

export async function sendStaffWhatsApp(
  to: string, // 10-digit Indian mobile
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await db.businessSettings.findFirst();
  if (!settings) return { ok: false, error: "Business settings missing" };

  const provider = createWhatsAppProvider({
    phoneNumberId: settings.whatsappPhoneNumberId,
    apiToken: settings.whatsappApiToken ? decryptSecret(settings.whatsappApiToken) : null,
    templateName: settings.whatsappTemplateName,
  });

  const outcome = await provider.send({ to, body, whatsappMessageType: "text" });
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/messaging/internal.ts
git commit -m "feat: internal staff WhatsApp send for digests"
```

---

### Task 10: `lib/recovery/run.ts` — cron step glue

**Files:**
- Create: `lib/recovery/run.ts`

- [ ] **Step 1: Implement**

```ts
// DB glue for the recovery cron and the /recovery page. Each step is
// independent; the cron route calls them in sequence and records a SyncLog.
import { subDays } from "date-fns";
import type { Profile } from "@prisma/client";
import { db } from "@/lib/db";
import { buildRiskInput } from "@/lib/ar/refresh";
import { riskScore } from "@/lib/ar/risk";
import { daysOverdue } from "@/lib/ar/aging";
import { shouldAutoFlag } from "./escalation";
import { buildDailyPlan, bucketSlip, type PlanParty, type DailyPlan } from "./plan";
import { refreshRecommendation } from "./recommend";

const ACTIVE_PARTY_WHERE = { isActive: true, totalOutstanding: { gt: 0 } } as const;
const STALE_ACTION_DAYS = 14;
const REC_REFRESH_COUNT = 15;
const CRON_PARTY_CAP = 500;

/** Step 1: flag parties matching the escalation rules. Idempotent. */
export async function runAutoFlag(): Promise<{ flagged: number; checked: number }> {
  const parties = await db.party.findMany({ where: ACTIVE_PARTY_WHERE, take: CRON_PARTY_CAP });
  let flagged = 0;
  for (const party of parties) {
    const input = await buildRiskInput(party);
    const verdict = shouldAutoFlag({
      outstanding: input.outstanding,
      maxDaysOverdue: input.maxDaysOverdue,
      brokenPromises: input.brokenPromises,
    });
    if (!verdict.flag) continue;
    const open = await db.escalation.findFirst({
      where: { partyId: party.id, status: "OPEN" },
      select: { id: true },
    });
    if (open) continue;
    await db.escalation.create({
      data: {
        partyId: party.id,
        reason: verdict.reason,
        events: { create: { toStage: "FLAGGED", note: `Auto-flagged: ${verdict.reason}` } },
      },
    });
    flagged++;
  }
  return { flagged, checked: parties.length };
}

/** Step 2: refresh AI recommendations for the top-scoring parties. */
export async function runRecommendationRefresh(): Promise<{ refreshed: number }> {
  const parties = await db.party.findMany({ where: ACTIVE_PARTY_WHERE, take: CRON_PARTY_CAP });
  const scored = await Promise.all(
    parties.map(async (p) => ({ id: p.id, score: riskScore(await buildRiskInput(p)).score }))
  );
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, REC_REFRESH_COUNT);
  for (const { id } of top) {
    await refreshRecommendation(id);
  }
  return { refreshed: top.length };
}

/** Assemble PlanParty[] for the daily plan. Used by cron and /recovery page. */
export async function assemblePlanParties(now: Date = new Date()): Promise<PlanParty[]> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const staleCutoff = subDays(today, STALE_ACTION_DAYS);

  const parties = await db.party.findMany({
    where: ACTIVE_PARTY_WHERE,
    take: CRON_PARTY_CAP,
    include: {
      invoices: {
        where: { status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
        select: { invoiceNumber: true, dueDate: true },
      },
      actions: {
        orderBy: { performedAt: "desc" },
        take: 1,
        select: { performedAt: true, promiseDate: true, promiseAmount: true, outcome: true },
      },
    },
  });

  const result: PlanParty[] = [];
  for (const party of parties) {
    const input = await buildRiskInput(party);
    const risk = riskScore(input);
    const reasons: PlanParty["reasons"] = [];

    // Promise due today or overdue (latest action carries the live promise).
    const latest = party.actions[0];
    if (
      latest?.outcome === "PROMISE_TO_PAY" &&
      latest.promiseDate &&
      latest.promiseDate <= today
    ) {
      reasons.push({
        kind: "promise_due",
        promiseDate: latest.promiseDate,
        promiseAmount: latest.promiseAmount ? Number(latest.promiseAmount) : null,
      });
    }

    // Invoice about to slip an aging bucket.
    for (const inv of party.invoices) {
      const slip = bucketSlip(daysOverdue(inv.dueDate, now));
      if (slip) {
        reasons.push({ kind: "bucket_slip", invoiceRef: inv.invoiceNumber, ...slip });
        break; // one slip reason per party is enough
      }
    }

    // High-risk with no recent contact.
    if (
      (risk.level === "HIGH" || risk.level === "CRITICAL") &&
      (!latest || latest.performedAt < staleCutoff)
    ) {
      const days = latest
        ? Math.round((today.getTime() - latest.performedAt.getTime()) / 86_400_000)
        : STALE_ACTION_DAYS;
      reasons.push({ kind: "stale_high_risk", daysSinceLastAction: days });
    }

    result.push({
      partyId: party.id,
      partyName: party.name,
      phone: party.phone,
      assignedToId: party.assignedToId,
      outstanding: input.outstanding,
      score: risk.score,
      reasons,
    });
  }
  return result;
}

/** Plan filtered to what one profile may see (staff: own + unassigned). */
export async function buildPlanForProfile(profile: Profile): Promise<DailyPlan> {
  const all = buildDailyPlan(await assemblePlanParties());
  if (profile.role === "ADMIN") return all;
  return {
    byStaff: new Map([[profile.id, all.byStaff.get(profile.id) ?? []]]),
    unassigned: all.unassigned, // staff see unassigned parties (existing RBAC rule)
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (verify `invoiceNumber` and `status` values against `model Invoice` in the schema; adjust if named differently).

- [ ] **Step 3: Commit**

```bash
git add lib/recovery/run.ts
git commit -m "feat: recovery cron steps — auto-flag, rec refresh, plan assembly"
```

---

### Task 11: Cron route + vercel.json

**Files:**
- Create: `app/api/cron/recovery/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implement the route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";
import { runAutoFlag, runRecommendationRefresh, assemblePlanParties } from "@/lib/recovery/run";
import { buildDailyPlan } from "@/lib/recovery/plan";
import { renderStaffDigest, renderAdminDigest } from "@/lib/recovery/digest";
import { sendStaffWhatsApp } from "@/lib/messaging/internal";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily recovery pass: auto-flag escalations → refresh AI recommendations →
// send WhatsApp digests. Steps are independent — one failing must not stop
// the others (spec §4). One SyncLog row records the whole pass.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const log = await db.syncLog.create({
    data: { syncType: "RECOVERY_CRON", status: "PENDING" },
  });

  const summary = {
    flagged: 0,
    checked: 0,
    recsRefreshed: 0,
    digestsSent: 0,
    digestsSkipped: 0,
    digestsFailed: 0,
    errors: [] as string[],
  };

  try {
    const r = await runAutoFlag();
    summary.flagged = r.flagged;
    summary.checked = r.checked;
  } catch (e) {
    summary.errors.push(`autoFlag: ${e instanceof Error ? e.message : String(e)}`);
    await captureError(e, { scope: "cron.recovery.autoFlag" });
  }

  try {
    const r = await runRecommendationRefresh();
    summary.recsRefreshed = r.refreshed;
  } catch (e) {
    summary.errors.push(`recRefresh: ${e instanceof Error ? e.message : String(e)}`);
    await captureError(e, { scope: "cron.recovery.recRefresh" });
  }

  try {
    const now = new Date();
    const plan = buildDailyPlan(await assemblePlanParties(now));
    const profiles = await db.profile.findMany();
    const staffNames = new Map(profiles.map((p) => [p.id, p.ownerName]));

    for (const [staffId, entries] of plan.byStaff) {
      const profile = profiles.find((p) => p.id === staffId);
      if (!profile?.phone) {
        summary.digestsSkipped++; // no phone on Profile — logged, not fatal (spec §3)
        continue;
      }
      const sent = await sendStaffWhatsApp(
        profile.phone,
        renderStaffDigest(profile.ownerName, entries, now)
      );
      if (sent.ok) summary.digestsSent++;
      else {
        summary.digestsFailed++;
        summary.errors.push(`digest ${profile.ownerName}: ${sent.error}`);
      }
    }

    const adminText = renderAdminDigest(plan, staffNames, now);
    for (const admin of profiles.filter((p) => p.role === "ADMIN" && p.phone)) {
      const sent = await sendStaffWhatsApp(admin.phone!, adminText);
      if (sent.ok) summary.digestsSent++;
      else {
        summary.digestsFailed++;
        summary.errors.push(`admin digest: ${sent.error}`);
      }
    }
  } catch (e) {
    summary.errors.push(`digest: ${e instanceof Error ? e.message : String(e)}`);
    await captureError(e, { scope: "cron.recovery.digest" });
  }

  await db.syncLog.update({
    where: { id: log.id },
    data: {
      status: summary.errors.length === 0 ? "SUCCESS" : "PARTIAL",
      completedAt: new Date(),
      details: summary,
    },
  });

  return NextResponse.json(summary);
}
```

> Check `enum SyncStatus` in the schema for the exact partial-success value (`PARTIAL` assumed — if the enum only has SUCCESS/FAILED, use `FAILED` when `errors.length > 0` and note the errors in `details`).

- [ ] **Step 2: Add the cron entry**

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 5 * * *" },
    { "path": "/api/cron/recovery", "schedule": "30 5 * * *" }
  ]
}
```

- [ ] **Step 3: Verify locally**

Run: `npx tsc --noEmit` then (with dev server running and `CRON_SECRET` set in `.env.local`):
`curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/recovery`
Expected: JSON summary; a `SyncLog` row with `syncType: RECOVERY_CRON` in the DB.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/recovery/route.ts vercel.json
git commit -m "feat: daily recovery cron — flag, recommend, digest"
```

---

### Task 12: Validation schemas + server actions (targets, escalations)

**Files:**
- Modify: `lib/validation.ts`
- Create: `app/(dashboard)/targets/actions.ts`, `app/(dashboard)/escalations/actions.ts`

- [ ] **Step 1: Add Zod schemas to `lib/validation.ts`** (append, following existing style)

```ts
export const recoveryTargetSchema = z.object({
  userId: z.string().uuid("Pick a staff member"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  targetAmount: z.coerce
    .number()
    .positive("Target must be positive")
    .max(1_000_000_000, "Target too large"),
});
export type RecoveryTargetInput = z.infer<typeof recoveryTargetSchema>;

export const escalationOpenSchema = z.object({
  partyId: z.string().min(1),
  reason: z.string().min(3, "Give a reason").max(500),
});
export type EscalationOpenInput = z.infer<typeof escalationOpenSchema>;

export const escalationNoteSchema = z.object({
  escalationId: z.string().min(1),
  note: z.string().min(3, "Note is required").max(1000),
});
export type EscalationNoteInput = z.infer<typeof escalationNoteSchema>;
```

- [ ] **Step 2: Create `app/(dashboard)/targets/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { recoveryTargetSchema, type RecoveryTargetInput } from "@/lib/validation";

type ActionResult = { error: string } | { ok: true };

export async function upsertRecoveryTarget(
  input: RecoveryTargetInput
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = recoveryTargetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { userId, month, targetAmount } = parsed.data;

  const [y, m] = month.split("-").map(Number);
  const monthKey = new Date(Date.UTC(y, m - 1, 1));

  await db.recoveryTarget.upsert({
    where: { userId_month: { userId, month: monthKey } },
    create: { userId, month: monthKey, targetAmount },
    update: { targetAmount },
  });

  revalidatePath("/targets");
  return { ok: true };
}
```

- [ ] **Step 3: Create `app/(dashboard)/escalations/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile, requireAdmin, canAccessParty } from "@/lib/authz";
import { nextStage } from "@/lib/recovery/escalation";
import { refreshRecommendation } from "@/lib/recovery/recommend";
import {
  escalationOpenSchema,
  escalationNoteSchema,
  type EscalationOpenInput,
  type EscalationNoteInput,
} from "@/lib/validation";

type ActionResult = { error: string } | { ok: true };

export async function openEscalation(input: EscalationOpenInput): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = escalationOpenSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const party = await db.party.findUnique({ where: { id: parsed.data.partyId } });
  if (!party || !canAccessParty(profile, party)) return { error: "Party not found." };

  // App-level guard; the partial unique index is the backstop.
  const existing = await db.escalation.findFirst({
    where: { partyId: party.id, status: "OPEN" },
    select: { id: true },
  });
  if (existing) return { error: "This party already has an open escalation." };

  await db.escalation.create({
    data: {
      partyId: party.id,
      reason: parsed.data.reason,
      openedById: profile.id,
      events: {
        create: { toStage: "FLAGGED", note: parsed.data.reason, byId: profile.id },
      },
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}

/** Admin-only: move one step up the ladder, note required (spec §4). */
export async function advanceEscalation(input: EscalationNoteInput): Promise<ActionResult> {
  const profile = await requireAdmin();
  const parsed = escalationNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const escalation = await db.escalation.findUnique({
    where: { id: parsed.data.escalationId },
  });
  if (!escalation || escalation.status !== "OPEN") return { error: "Escalation not open." };

  const to = nextStage(escalation.stage);
  if (!to) return { error: "Already at the final stage (Legal)." };

  await db.escalation.update({
    where: { id: escalation.id },
    data: {
      stage: to,
      events: {
        create: {
          fromStage: escalation.stage,
          toStage: to,
          note: parsed.data.note,
          byId: profile.id,
        },
      },
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}

async function closeEscalation(
  input: EscalationNoteInput,
  status: "RESOLVED" | "DISMISSED"
): Promise<ActionResult> {
  const profile = await requireAdmin();
  const parsed = escalationNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const escalation = await db.escalation.findUnique({
    where: { id: parsed.data.escalationId },
  });
  if (!escalation || escalation.status !== "OPEN") return { error: "Escalation not open." };

  await db.escalation.update({
    where: { id: escalation.id },
    data: {
      status,
      events: {
        create: {
          fromStage: escalation.stage,
          toStage: escalation.stage,
          note: `${status === "RESOLVED" ? "Resolved" : "Dismissed"}: ${parsed.data.note}`,
          byId: profile.id,
        },
      },
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}

export async function resolveEscalation(input: EscalationNoteInput): Promise<ActionResult> {
  return closeEscalation(input, "RESOLVED");
}

export async function dismissEscalation(input: EscalationNoteInput): Promise<ActionResult> {
  return closeEscalation(input, "DISMISSED");
}

/** On-demand AI recommendation refresh for one party (spec §4). */
export async function refreshPartyRecommendation(partyId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party || !canAccessParty(profile, party)) return { error: "Party not found." };

  await refreshRecommendation(partyId);
  revalidatePath(`/parties/${partyId}`);
  return { ok: true };
}

/** Staff may add a note (event) to escalations on parties they can access. */
export async function addEscalationNote(input: EscalationNoteInput): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = escalationNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const escalation = await db.escalation.findUnique({
    where: { id: parsed.data.escalationId },
    include: { party: true },
  });
  if (!escalation || !canAccessParty(profile, escalation.party)) {
    return { error: "Escalation not found." };
  }

  await db.escalationEvent.create({
    data: {
      escalationId: escalation.id,
      fromStage: escalation.stage,
      toStage: escalation.stage,
      note: parsed.data.note,
      byId: profile.id,
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/validation.ts "app/(dashboard)/targets/actions.ts" "app/(dashboard)/escalations/actions.ts"
git commit -m "feat: server actions for recovery targets and escalation ladder"
```

---

### Task 13: Thin UI pages + sidebar links

Keep these minimal — tables and plain forms using existing `components/ui` primitives. Look at `app/(dashboard)/actions/page.tsx` for the established table/page style and mirror it.

**Files:**
- Create: `app/(dashboard)/recovery/page.tsx`
- Create: `app/(dashboard)/escalations/page.tsx`
- Create: `app/(dashboard)/targets/page.tsx`
- Modify: `app/(dashboard)/_components/sidebar.tsx`

- [ ] **Step 1: `/recovery` page**

```tsx
import Link from "next/link";
import { requireProfile } from "@/lib/authz";
import { buildPlanForProfile } from "@/lib/recovery/run";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/format";
import type { PlanParty, PlanReason } from "@/lib/recovery/plan";

export const dynamic = "force-dynamic";

function reasonText(r: PlanReason): string {
  switch (r.kind) {
    case "promise_due":
      return "Promise due";
    case "bucket_slip":
      return `Slipping to ${r.nextBucket} in ${r.daysToSlip}d`;
    case "stale_high_risk":
      return `No contact ${r.daysSinceLastAction}d`;
    case "top_score":
      return "Top outstanding";
  }
}

function ChaseList({ title, entries }: { title: string; entries: PlanParty[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="divide-y rounded-md border">
        {entries.map((e) => (
          <li key={e.partyId} className="flex items-center justify-between p-3">
            <div>
              <Link href={`/parties/${e.partyId}`} className="font-medium hover:underline">
                {e.partyName}
              </Link>
              <p className="text-sm text-muted-foreground">{reasonText(e.reasons[0])}</p>
            </div>
            <span className="font-medium">{formatINR(e.outstanding)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function RecoveryPage() {
  const profile = await requireProfile();
  const plan = await buildPlanForProfile(profile);
  const profiles =
    profile.role === "ADMIN" ? await db.profile.findMany() : [profile];
  const names = new Map(profiles.map((p) => [p.id, p.ownerName]));

  const sections = [...plan.byStaff.entries()];
  const empty = sections.every(([, v]) => v.length === 0) && plan.unassigned.length === 0;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Today&apos;s recovery plan</h1>
      {empty && <p className="text-muted-foreground">No follow-ups due today. All clear.</p>}
      {sections.map(([staffId, entries]) => (
        <ChaseList key={staffId} title={names.get(staffId) ?? "Staff"} entries={entries} />
      ))}
      <ChaseList title="Unassigned" entries={plan.unassigned} />
    </div>
  );
}
```

- [ ] **Step 2: `/escalations` page**

```tsx
import Link from "next/link";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatINR, formatDate } from "@/lib/format";
import { EscalationControls } from "./escalation-controls";

export const dynamic = "force-dynamic";

const STAGE_ORDER = ["LEGAL", "FINAL_NOTICE", "NOTICE", "FLAGGED"] as const;
const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  FLAGGED: "Flagged",
  NOTICE: "Notice sent",
  FINAL_NOTICE: "Final notice",
  LEGAL: "Legal",
};

export default async function EscalationsPage() {
  const profile = await requireProfile();
  const escalations = await db.escalation.findMany({
    where: { status: "OPEN", party: partyScopeWhere(profile) },
    include: {
      party: { select: { id: true, name: true, totalOutstanding: true } },
      events: { orderBy: { createdAt: "desc" }, take: 3, include: { by: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Escalations</h1>
      {escalations.length === 0 && (
        <p className="text-muted-foreground">No open escalations.</p>
      )}
      {STAGE_ORDER.map((stage) => {
        const group = escalations.filter((e) => e.stage === stage);
        if (group.length === 0) return null;
        return (
          <section key={stage} className="space-y-2">
            <h2 className="text-lg font-semibold">{STAGE_LABEL[stage]}</h2>
            <ul className="divide-y rounded-md border">
              {group.map((e) => (
                <li key={e.id} className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <Link href={`/parties/${e.party.id}`} className="font-medium hover:underline">
                      {e.party.name}
                    </Link>
                    <span>{formatINR(Number(e.party.totalOutstanding))}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{e.reason}</p>
                  <ul className="text-xs text-muted-foreground">
                    {e.events.map((ev) => (
                      <li key={ev.id}>
                        {formatDate(ev.createdAt)} — {ev.note}
                        {ev.by ? ` (${ev.by.ownerName})` : " (system)"}
                      </li>
                    ))}
                  </ul>
                  <EscalationControls
                    escalationId={e.id}
                    stage={e.stage}
                    isAdmin={profile.role === "ADMIN"}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `EscalationControls` client component** — `app/(dashboard)/escalations/escalation-controls.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  advanceEscalation,
  resolveEscalation,
  dismissEscalation,
  addEscalationNote,
} from "./actions";

export function EscalationControls({
  escalationId,
  stage,
  isAdmin,
}: {
  escalationId: string;
  stage: string;
  isAdmin: boolean;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: (i: { escalationId: string; note: string }) => Promise<{ error: string } | { ok: true }>) {
    startTransition(async () => {
      const result = await action({ escalationId, note });
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Updated");
        setNote("");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (required)"
        className="max-w-xs"
      />
      {isAdmin && stage !== "LEGAL" && (
        <Button size="sm" disabled={pending} onClick={() => run(advanceEscalation)}>
          Advance
        </Button>
      )}
      {isAdmin && (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(resolveEscalation)}>
            Resolve
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(dismissEscalation)}>
            Dismiss
          </Button>
        </>
      )}
      {!isAdmin && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(addEscalationNote)}>
          Add note
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `/targets` page** — `app/(dashboard)/targets/page.tsx`

```tsx
import { requireProfile } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { istMonthKey, istMonthWindow, pace } from "@/lib/recovery/targets";
import { TargetForm } from "./target-form";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const profile = await requireProfile();
  const isAdmin = profile.role === "ADMIN";
  const now = new Date();
  const monthKey = istMonthKey(now);
  const { start, end } = istMonthWindow(monthKey);

  const staff = isAdmin ? await db.profile.findMany() : [profile];
  const targets = await db.recoveryTarget.findMany({
    where: { month: monthKey, userId: { in: staff.map((s) => s.id) } },
  });

  const rows = await Promise.all(
    staff.map(async (s) => {
      const target = targets.find((t) => t.userId === s.id);
      const collected = await db.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentDate: { gte: start, lt: end },
          party: { assignedToId: s.id },
        },
      });
      const collectedNum = Number(collected._sum.amount ?? 0);
      const targetNum = target ? Number(target.targetAmount) : 0;
      return { staff: s, targetNum, collectedNum, pace: pace(targetNum, collectedNum, now) };
    })
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Recovery targets — {monthKey.toISOString().slice(0, 7)}</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Staff</th>
            <th className="p-2">Target</th>
            <th className="p-2">Collected</th>
            <th className="p-2">Pace</th>
            <th className="p-2">Projection</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ staff: s, targetNum, collectedNum, pace: p }) => (
            <tr key={s.id} className="border-b">
              <td className="p-2">{s.ownerName}</td>
              <td className="p-2">{targetNum ? formatINR(targetNum) : "—"}</td>
              <td className="p-2">{formatINR(collectedNum)}</td>
              <td className="p-2">
                {targetNum
                  ? `${Math.round(p.actualPct * 100)}% (${p.onTrack ? "on track" : "behind"})`
                  : "—"}
              </td>
              <td className="p-2">{targetNum ? formatINR(p.projectedTotal) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isAdmin && <TargetForm staff={staff.map((s) => ({ id: s.id, name: s.ownerName }))} month={monthKey.toISOString().slice(0, 7)} />}
    </div>
  );
}
```

- [ ] **Step 5: `TargetForm` client component** — `app/(dashboard)/targets/target-form.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertRecoveryTarget } from "./actions";

export function TargetForm({
  staff,
  month,
}: {
  staff: { id: string; name: string }[];
  month: string; // YYYY-MM
}) {
  const [userId, setUserId] = useState(staff[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await upsertRecoveryTarget({
            userId,
            month,
            targetAmount: Number(amount),
          });
          if ("error" in result) toast.error(result.error);
          else toast.success("Target saved");
        });
      }}
    >
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="h-9 rounded-md border px-2 text-sm"
      >
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Input
        type="number"
        min="1"
        placeholder="Target ₹ for this month"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="max-w-xs"
      />
      <Button type="submit" size="sm" disabled={pending || !amount}>
        Set target
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Sidebar links**

In `app/(dashboard)/_components/sidebar.tsx`, find the nav-items array (entries like `/parties`, `/invoices`) and add three entries following the existing item shape (label, href, icon from `lucide-react` — use `Target`, `TrendingUp`, `AlertTriangle`):

- `Recovery` → `/recovery`
- `Escalations` → `/escalations`
- `Targets` → `/targets`

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, log in, visit `/recovery`, `/escalations`, `/targets`. With seeded data: chase list renders, target form saves, escalation controls advance with a note and error without one. Also verify a STAFF login sees only its own plan and cannot see admin controls.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/recovery" "app/(dashboard)/escalations" "app/(dashboard)/targets" "app/(dashboard)/_components/sidebar.tsx"
git commit -m "feat: recovery, escalations, and targets pages"
```

---

### Task 14: Env docs, README, full verification

**Files:**
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: Add to `.env.example`** (in the integrations/keys section, following existing comment style)

```bash
# Anthropic API key for AI collection recommendations (optional — the app
# falls back to deterministic rules-based advice when unset).
ANTHROPIC_API_KEY=
```

- [ ] **Step 2: README** — add a short "Recovery module" subsection under features/environment mentioning: `/recovery`, `/escalations`, `/targets` pages, the second cron (`/api/cron/recovery`, 11:00 IST), `ANTHROPIC_API_KEY` optional, and the one-time partial-index SQL (`prisma/sql/2026-07-21-escalation-open-unique.sql`) per Supabase project.

- [ ] **Step 3: Full verification**

Run: `npm test` — Expected: all suites pass (existing + ~23 new tests).
Run: `npx tsc --noEmit` — Expected: clean.
Run: `npm run build` — Expected: builds.
Run: `npm run lint` — Expected: no new warnings.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: recovery module env and setup notes"
```

---

## Deployment checklist (per Supabase project — pilot runs it twice)

1. `npm run db:push`
2. Run `prisma/sql/2026-07-21-escalation-open-unique.sql` in the Supabase SQL editor
3. Set `ANTHROPIC_API_KEY` in Vercel env (optional but recommended)
4. Redeploy so `vercel.json` registers the new cron
5. Each staff member sends one WhatsApp message to the business number (opens Meta's 24h service window for digests)
