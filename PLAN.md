# SynWorks — Phase 1 hardening & build-out plan

Working plan for this session. Delete when merged.

## Step 0 findings

**What exists**
- Next.js 14 App Router, TS strict, Tailwind, Prisma → Supabase Postgres.
- Auth is **Supabase Auth** (SSR cookie flow in `middleware.ts`, `lib/supabase/*`,
  server actions for login/signup with Zod + DB-backed login rate limiting).
  The README's "NextAuth.js v4" claim is stale — docs are wrong, code is right.
  Leftovers: `NEXTAUTH_URL` in env files, `types/next-auth.d.ts` stub.
- Marketing page, signup/login/onboarding flows, dashboard shell with
  **hardcoded ₹0 stat cards** and placeholder panels.
- Sidebar links to /parties, /invoices, /payments, /actions, /proformas,
  /settings — none of these routes exist (404).
- Prisma schema models Party/Invoice/Payment/Action/ProformaInvoice/SyncLog/
  LoginAttempt. No consent fields, no message log, `whatsappApiToken` stored
  plaintext (open TODO in schema).
- No tests, no migrations dir (uses `prisma db push`).

**Promised by UI/marketing but missing**
- Tally/Zoho/Excel import (onboarding asks which tool you use; nothing imports).
- "Send follow-up via WhatsApp or SMS", message drafts, promise reminders.
- All CRUD.

## Decisions (made to keep moving; flag if you disagree)

1. **Deploy model preserved** — one Supabase project per distributor, no
   multi-tenancy. All provider credentials that are per-distributor live in
   env vars (one deployment = one distributor), except the WhatsApp token
   which is already modeled in `BusinessSettings` and is now encrypted.
2. **Secret encryption**: AES-256-GCM with a deployment-level
   `APP_ENCRYPTION_KEY` (32-byte base64), `lib/crypto.ts`. Chosen over
   Supabase Vault because Vault requires raw-SQL access paths outside Prisma
   and complicates the per-distributor setup script; env-key envelope
   encryption is standard, auditable, and swappable later. Decryption is
   server-only; the token is never selected into any client payload.
3. **Scheduler**: **cron via authenticated API route** (`/api/cron/reminders`
   + `vercel.json` cron or any external cron hitting it with `CRON_SECRET`).
   BullMQ rejected: needs Redis per distributor — extra infra and cost for a
   low-volume workload (tens of reminders/day). A daily/hourly cron pass over
   due invoices is sufficient and idempotent.
4. **WhatsApp**: Meta **WhatsApp Cloud API directly** (Graph API via fetch)
   behind a `ChannelProvider` interface — no BSP SDK dependency; any BSP that
   speaks the Cloud API shape can be swapped in behind the interface.
   Utility-category templates only.
5. **SMS/email providers**: same interface; MSG91 (SMS) and Resend (email)
   via plain fetch, env-configured. Unconfigured providers fail closed with a
   logged `FAILED` message, never silently.
6. **Payment links**: Razorpay Payment Links REST API (supports UPI +
   partial payments via `first_min_partial_amount`), no SDK.
7. **RBAC visibility**: ADMIN sees everything and manages settings/imports.
   STAFF sees parties assigned to them **plus unassigned parties**, and the
   invoices/payments/actions of those parties. Enforced server-side via a
   shared `partyScopeWhere()` helper in every query and action.
8. **CSV import** instead of live Tally/Zoho sync (closes the onboarding
   promise gap). `papaparse` for parsing; dedupe on `tallyRef` and
   `partyId+invoiceNumber`. Live sync stays future work.
9. **Tests**: `vitest` (dev-only) for the pure logic the brief requires to be
   testable: risk score, aging buckets, sending gate.
10. **Rename**: `package.json` name → `synworks`; no "debt collection"
    wording anywhere in code/docs/UI. The repo *directory* on disk is still
    `debt-collection-software` — renaming the working directory mid-session
    breaks tooling; rename the folder + any git remote yourself after this
    session (`mv` + re-open).

## Sequencing

- **A — foundations**: README auth fix, rename, `lib/crypto.ts` +
  encrypted WhatsApp token, RBAC helpers (`lib/authz.ts`), env cleanup.
- **B — real data**: dashboard aggregates; Parties/Invoices/Payments/Actions
  list+detail+create+edit with Zod + RBAC; CSV import (parties, invoices).
- **C — aging & risk**: `lib/ar/aging.ts`, `lib/ar/risk.ts` (pure, tested),
  worklist page sorted by risk×amount; risk refresh on cron + on-demand.
- **D — compliance (before any send code)**: consent fields on Party;
  `Message` model (full audit trail incl. inbound); CSV/JSON export endpoint;
  deterministic gate (`lib/messaging/gate.ts`): consent required, quiet hours
  (per-settings tz, default India 08:00–19:00), frequency caps, opt-out,
  DISPUTED auto-pause. The gate is called inside `sendMessage()` — the only
  send path — not advisory.
- **E — channels**: `ChannelProvider` interface; WhatsApp Cloud API, SMS,
  email providers; WhatsApp webhook (delivery status + inbound; "STOP" →
  instant opt-out); Razorpay payment links embedded in reminders; cron
  reminder pass.

## Phase 2 — not yet started (design for review; do NOT build yet)

AI reply classification + escalation ladder. Depends on Phase D/E being live
and exercised in production first. Separate session.

### Architecture: three layers, strict separation of powers

```
inbound reply ──▶ 1. INTENT CLASSIFIER (LLM, read-only)
                        │ emits one enum, nothing else
                        ▼
                  2. ESCALATION STATE MACHINE (deterministic code)
                        │ picks the tone state / handoff
                        ▼
                  3. DRAFTER (LLM, writes text within the state)
                        │ draft only — no send capability
                        ▼
                  sendReminder()  ← existing Phase D gate, unchanged
```

The LLM appears twice and **neither appearance has authority**: the
classifier can only name what the customer said; the drafter can only word a
message whose tone, channel, and timing were already decided by code. The
existing deterministic gate (consent, quiet hours, caps, pause) runs last,
exactly as it does for human-clicked sends today.

### 1. Intent classification (inbound `Message` rows)

- Trigger: webhook writes an INBOUND message → enqueue classification.
- Output: single enum + confidence, stored on a new
  `Message.classifiedIntent` column:
  `PAYMENT_CONFIRMED | PROMISE_TO_PAY | REQUESTS_TIME | DISPUTE |
   QUESTION | OPT_OUT_INTENT | UNCLEAR`
- Hard rules run BEFORE the LLM (cheap + deterministic): exact "STOP" words
  already flip consent in the webhook; payment-received keywords with a UTR
  pattern can suggest PAYMENT_CONFIRMED but never auto-apply money.
- `DISPUTE` intent → same pauseForDispute() path as a human logging DISPUTED.
- `UNCLEAR` or confidence < threshold → HUMAN_HANDOFF, never guess.
- Model: claude-haiku-4-5 (cheap, fast, classification-grade); structured
  output constrained to the enum.

### 2. Escalation state machine (pure code, mirrors lib/messaging/gate.ts style)

New `Party.escalationState`: `FRIENDLY → FIRM → FORMAL → HUMAN_HANDOFF`.

Transitions are **only** these, all deterministic:
- Time-based: N days overdue with no reply/payment ⇒ advance one step
  (defaults: 7 / 21 / 45 days, configurable on BusinessSettings).
- Reply-based: PROMISE_TO_PAY or REQUESTS_TIME ⇒ hold state until promise
  date + grace; broken promise ⇒ advance.
- Payment recorded ⇒ reset to FRIENDLY.
- DISPUTE / UNCLEAR / OPT_OUT_INTENT ⇒ HUMAN_HANDOFF (terminal until a human
  acts). HUMAN_HANDOFF sends nothing automatically.
- The LLM never appears in this layer. Unit-test the transition table
  exhaustively like the gate.

### 3. Drafting (LLM writes words, nothing else)

- Input: state, invoice facts, payment link, business name. Output: message
  text for SMS/email body (WhatsApp stays on pre-approved utility templates —
  drafted text is only usable where free-form is allowed, i.e. inside a
  24-hour customer-service window after an inbound reply).
- Guardrails on the draft itself: max length, no invented amounts/dates
  (validate every ₹ figure and date in the draft against the invoice record —
  reject drafts containing numbers we didn't supply), mandatory opt-out line,
  banned-phrase list (no threats, no third-party disclosure — RBI FPC basics).
- Every draft goes through `sendReminder()` — the Phase D gate — with zero
  changes to the gate. A rejected draft is logged as BLOCKED like anything else.

### Storage additions (Phase 2 migration)

- `Message.classifiedIntent`, `Message.classificationConfidence`
- `Party.escalationState`, `Party.escalationStateChangedAt`
- `EscalationEvent` table (party, fromState, toState, cause, messageId?) —
  audit trail for why the ladder moved.

### Review queue UI

Worklist gains a "Needs human" tab: HUMAN_HANDOFF parties with the inbound
message, classified intent, and one-click actions (log dispute, record
promise, resume ladder, opt out).

### Why this shape

- Escalation is the legally/reputationally sensitive decision — it stays in
  reviewable, testable code with an audit table.
- The classifier failing open (UNCLEAR → human) is safe; failing into a
  wrong state is not, so it never picks states.
- The drafter cannot leak authority: it has no tools, no send access, and
  its output is validated then gated.

---

## Session log (what was actually done)

- Phase A–E implemented and committed in phase-sized commits.
- Schema pushed to the linked Supabase project via `prisma db push`
  (new: consent/pause fields on Party, guardrail + WhatsApp template fields
  on BusinessSettings, Message, PaymentLink).
- 23 unit tests (aging, risk, gate) green; `tsc`, `next lint`, `next build`
  green.
- Not done / known gaps: proforma create/convert UI (stub list only),
  Payments lack an edit UI for metadata (action exists, no page), WhatsApp
  session messages within the 24h window (template-only for now), Razorpay
  webhook for link-paid status (links update on reuse-lookup only, payments
  still recorded manually), live Tally/Zoho API sync (CSV import covers the
  promise), per-STAFF assignment UI beyond the party form.
