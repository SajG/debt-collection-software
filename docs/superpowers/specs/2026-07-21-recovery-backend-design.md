# Recovery Backend — Design Spec

**Date:** 2026-07-21
**Status:** Approved by owner
**Scope:** Extend PayTrack with recovery-collection features for a two-deployment pilot (own company + one client).

## Context

PayTrack (this repo) already has parties, invoices, payments, actions with promise-to-pay tracking, WhatsApp/SMS/email messaging behind a `ChannelProvider` interface, Tally sync, CSV import, Supabase Auth with ADMIN/STAFF roles, and a `CRON_SECRET`-authed reminders cron.

RecoveryAI (`~/Desktop/Code/RecoveryAI/RecoveryAI`, "Synergy Recovery OS") is the internal predecessor. We borrow its **logic** — priority thresholds, promise-follow-up queries, daily-plan structure — not its code (NextAuth vs Supabase Auth, separate Salesperson model vs staff users, Ollama vs Claude API).

### Decisions made during brainstorming

| Question | Decision |
|---|---|
| Where does this live | Extend PayTrack in place (Approach A) |
| Pilot features | Recovery targets + scorecards, escalation workflow, recovery intelligence. BI dashboards excluded. |
| Salespeople model | Staff login users (`Profile`, STAFF role) are the salespeople. No separate Salesperson model. |
| AI engine | Deterministic rules + Claude API (`claude-haiku-4-5`) for per-party advice. Rules-only fallback when AI unavailable. |
| Escalation | Cron auto-flags by rules; humans advance the ladder manually with notes. |
| Daily digest | Per-staff WhatsApp chase list + admin full summary, via existing WhatsApp integration. |

## 1. Data model

Three new Prisma models plus one child model. Existing models unchanged (`Action.promiseDate/promiseAmount` already covers promise tracking).

### RecoveryTarget

- `id`, `userId` (→ `Profile`), `month` (DateTime, normalized to first-of-month), `targetAmount` (Decimal 12,2), timestamps.
- Unique `(userId, month)`.
- Admin-managed. Collected amount is **computed live** — sum of `Payment`s in the month for parties assigned to that user. No cached column; pilot volume is tiny.

### Escalation

- `id`, `partyId` (→ `Party`), `stage`, `status`, `reason` (text — which rule or manual note flagged it), `openedById` (nullable `Profile` ref; null = auto-flagged by cron), timestamps.
- `enum EscalationStage { FLAGGED, NOTICE, FINAL_NOTICE, LEGAL }`
- `enum EscalationStatus { OPEN, RESOLVED, DISMISSED }`
- At most one OPEN escalation per party, enforced with a partial unique index (raw SQL migration step: `CREATE UNIQUE INDEX ... ON "Escalation"("partyId") WHERE status = 'OPEN'`).

### EscalationEvent

- `id`, `escalationId`, `fromStage` (nullable), `toStage`, `note`, `byId` (nullable `Profile` ref; null = system), `createdAt`.
- Append-only ladder history. Every stage move, resolve, or dismiss writes one event.

### Recommendation

- `id`, `partyId` (unique — one cached rec per party), `content` (Json), `generatedAt`, `model` (text, e.g. `claude-haiku-4-5` or `rules-fallback`).
- `content` JSON shape: `{ nextAction, urgency ("today" | "this_week" | "this_month"), talkingPoints: string[], draftMessage }`.
- Refreshed nightly by cron for top-priority parties; on-demand refresh per party. Reads are stale-tolerant and never block page render.

Digest sends are logged to the existing `Message` model; no new model needed.

## 2. Pure logic modules — `lib/recovery/`

No DB imports; all functions take plain data in and return plain data out. All vitest-tested.

### `scoring.ts`

- `getPriority(outstanding, daysOverdue, brokenPromises, daysSinceLastPayment)` → bucket + numeric score for sorting.
- Buckets (borrowed from RecoveryAI `rules.ts`): outstanding ≥ ₹5,00,000 or overdue ≥ 180d → **Critical**; ≥ ₹2,00,000 or ≥ 90d → **High**; ≥ ₹50,000 or ≥ 30d → **Medium**; else **Low**. Broken promises and payment recency raise the numeric score within a bucket.
- Thresholds are module constants in one place. Hardcoded for pilot; configurable later.

### `escalation.ts`

- `shouldAutoFlag(party)` → `{ flag: boolean, reason: string }`.
- Rules: (overdue ≥ 60 days AND outstanding ≥ ₹50,000) OR broken promises ≥ 2.
- A broken promise = an `Action` whose `promiseDate` passed with no payment covering `promiseAmount` before a later action or 7-day grace.

### `targets.ts`

- Month-window helpers (IST boundaries, not UTC), collected-vs-target, pace % (expected progress at day N of month), linear month-end projection.

### `plan.ts`

- `buildDailyPlan(inputs)` → per-staff chase lists. Sources, in priority order:
  1. Promise follow-ups due today or overdue.
  2. Invoices that will cross into the next aging bucket within 7 days.
  3. High-risk parties with no logged action in 14+ days.
  4. Top-N remaining parties by score.
- Dedupes across sources (a party appears once, tagged with its strongest reason), groups by assigned staff; unassigned parties go to the admin list.

## 3. AI layer — `lib/ai/`

- `claude.ts`: Anthropic Messages API, model `claude-haiku-4-5`. Server-only; `ANTHROPIC_API_KEY` env var.
- **Per-party recommendation**: input = party context (name, outstanding, days overdue, assigned staff) + history (recent payments, actions/outcomes, invoice aging) — same shape RecoveryAI feeds Ollama. Output = strict JSON matching the `Recommendation.content` shape, Zod-validated; one retry on malformed JSON, then fall back.
- **Prompt caching** on the static system prompt (collections-advisor instructions, Indian B2B context); only the per-party history varies.
- **Fail-open fallback**: if the API is unconfigured, errors, or returns unusable JSON twice, generate a rules-based recommendation from `scoring.ts` and store it with `model = "rules-fallback"`. The pilot never blocks on AI.
- **Digest text is template-based** from `plan.ts` output — deterministic. Claude writes only per-party advice. Nightly refresh of the top 15 parties by score keeps cost at pennies/day.
- Implementation note: consult the claude-api skill for current SDK and caching patterns when building this module.

## 4. API surface, cron, RBAC

### Server actions (existing pattern: Zod input → auth check → `partyScopeWhere`)

- **Targets**: set/edit monthly target per staff (admin-only).
- **Escalations**: open manually, advance stage (note required), resolve, dismiss. Each writes an `EscalationEvent`. Stage moves are admin-only; staff may add notes/events on their own parties.
- **Recommendations**: on-demand refresh for a single party.

### Read paths (server components; no new REST routes)

- `/recovery` — today's chase list. Staff see their own; admin sees all with a staff filter.
- `/escalations` — open queue grouped by stage; per-party ladder history.
- `/targets` — scorecard: target vs collected vs pace per staff.

Thin UI pages are in scope so the pilot is operable; backend is the substance.

### Cron — `/api/cron/recovery`

`CRON_SECRET`-authed like the existing reminders route. Added to `vercel.json` at `30 5 * * *` (11:00 IST, after the 10:30 IST reminders run). Three independent steps — a failure in one does not stop the others; failures are logged following the existing `SyncLog` pattern:

1. **Auto-flag escalations** — run `shouldAutoFlag` over active parties; skip any party with an existing OPEN escalation (idempotent).
2. **Refresh recommendations** — top 15 parties by score through Claude (or fallback).
3. **Send digests** — build per-staff digest + admin summary from `plan.ts`, send via existing WhatsApp `ChannelProvider` to each recipient's `Profile.phone`, log to `Message`. A staff member with no phone set is skipped with a logged warning. WhatsApp failure marks the `Message` row FAILED (existing behavior); the digest remains visible in-app at `/recovery`.

### RBAC

Reuse existing rule: STAFF sees assigned + unassigned parties; ADMIN sees everything. Targets and escalation stage moves are admin-only.

## 5. Testing & error handling

Vitest (existing setup) on the pure modules:

- `scoring.ts` — bucket boundaries (exactly ₹50k, exactly 30d, etc.), score ordering.
- `escalation.ts` — flag rules, edge cases (exactly 60d, 2nd broken promise, grace window).
- `targets.ts` — IST month boundaries, pace math, first/last day of month.
- `plan.ts` — dedupe across sources, per-staff grouping, unassigned → admin, empty states.
- AI parsing — malformed Claude output → fallback, never throws to caller.

## 6. Pilot rollout

1. **Deploy #1 — own company**: dedicated Supabase project, real data via existing Tally sync / CSV import.
2. Run 1–2 weeks; tune scoring/escalation thresholds from real behavior.
3. **Deploy #2 — client**: fresh Supabase project, same build. Matches the one-Supabase-per-distributor deploy model (no multi-tenancy).
4. New env var: `ANTHROPIC_API_KEY` only. Everything else reuses existing config.

## Out of scope

- BI dashboards (cash flow, working capital, concentration risk, customer profitability).
- RecoveryAI's pricing, salary, proposals, proforma modules.
- Multi-tenancy; threshold-configuration UI; SMS/email digests (WhatsApp + in-app only).
