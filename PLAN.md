# PayTrack — Phase 1 hardening & build-out plan

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
10. **Rename**: `package.json` name → `paytrack`; no "debt collection"
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

## Phase 2 — not yet started (design only, see end of PLAN)

AI reply classification & escalation ladder: deterministic state machine
(FRIENDLY → FIRM → FORMAL → HUMAN_HANDOFF) driven by days-overdue +
reply-intent classification; LLM only drafts text *within* the current state
and never chooses the state; every draft re-enters the Phase D gate.
Depends on Phase D being live. Separate session.
