# Syncit — AR & Payment Follow-up for MSME Distributors

A B2B accounts-receivable tool for Indian MSME distributors who sell goods on credit. Tracks buyers, outstanding invoices, payment history, and drives follow-up workflows.

## Deploy model

**Shared multi-tenant (SY21).** One Supabase project runs every
customer as an `Organization` row. Every business table carries an
`organizationId`; membership of a Profile in an Organization is
recorded in `Membership` (role + isActive live there — Profile keeps
identity fields only). Row-level isolation is enforced by RLS
scoped on `Organization` (SY22 — RLS policies land in a follow-up
migration; SY21 is schema + backfill only).

Legacy note: earlier releases ran "one Supabase project = one
distributor" with no shared DB. The SY21 migration
(`20260929030000_multi_tenant_orgs`) creates the `synergy` org and
attaches every existing row to it; RLS enforcement arrives in SY22.
Per-tenant secrets (WhatsApp, Razorpay, Tally sync token) now live
in encrypted columns on `BusinessSettings` — env vars remain for
platform-level keys only (Supabase, Resend, Anthropic, CRON_SECRET,
APP_ENCRYPTION_KEY).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| ORM | Prisma → Supabase Postgres |
| Auth | Supabase Auth (SSR cookie sessions via `@supabase/ssr`) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Toasts | Sonner |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in your Supabase credentials
cp .env.example .env.local

# 3. Push schema to Supabase
npm run db:push

# 4. (Optional) seed placeholder data
npm run db:seed

# 5. Start dev server
npm run dev
```

## Environment variables

See `.env.example`. Two connection strings are required for Prisma + Supabase:

- `DATABASE_URL` — pooled connection (pgBouncer, port 6543) — used at runtime
- `DIRECT_URL` — direct connection (port 5432) — used by Prisma for migrations only

Auth uses the same Supabase project (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus server-only
`SUPABASE_SERVICE_ROLE_KEY` for signup).

`APP_ENCRYPTION_KEY` (32 bytes, base64 — `openssl rand -base64 32`) encrypts
stored secrets such as the WhatsApp API token at rest. Messaging, payment
links, and the reminder cron have their own keys — all documented in
`.env.example`.

## Recovery module

Adds `/recovery` (today's chase list), `/escalations` (open ladder), and
`/targets` (monthly scorecard) pages plus a second cron `/api/cron/recovery`
scheduled at 11:00 IST (`30 5 * * *` UTC) that:

1. Auto-flags parties matching the escalation rules
   (`lib/recovery/escalation.ts`).
2. Refreshes AI recommendations for the top 15 parties by risk score
   through the Anthropic API (`claude-haiku-4-5`), falling back to
   deterministic rules when `ANTHROPIC_API_KEY` is unset or the call fails.
3. Sends per-staff WhatsApp digests + an admin summary via the existing
   WhatsApp provider (see `lib/messaging/internal.ts` for the gate
   exception).

Per Supabase project setup:

1. `npm run db:push`
2. Run `prisma/sql/2026-07-21-escalation-open-unique.sql` once in the
   Supabase SQL editor (partial unique index — one OPEN escalation per
   party).
3. Optionally set `ANTHROPIC_API_KEY` in Vercel env.
4. Redeploy so `vercel.json` registers the new cron.
5. Each staff member sends one WhatsApp to the business number to open
   Meta's 24h service window for free-form digest delivery.

Design spec: `docs/superpowers/specs/2026-07-21-recovery-backend-design.md`.
Implementation plan: `docs/superpowers/plans/2026-07-21-recovery-backend.md`.
