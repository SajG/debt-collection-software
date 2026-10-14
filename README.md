# Syncit — order-to-cash for manufacturers and distributors

Syncit is a multi-company web and mobile app for Indian manufacturers and
distributors who sell on credit: orders, factory progress, dispatch
documents, outstanding invoices, payment follow-up and payments — one
place for sales, the factory and management.

- **Web** — Next.js 14 (App Router), this directory. Live at `getsyncit.app`.
- **Mobile** — Expo SDK 54, [`mobile/`](./mobile). English, Hindi, Marathi.
- **Data** — one Supabase project (Postgres + Auth + Storage) for every
  company; Prisma on the server; row-level security in the database.

## How companies are kept apart

One database, many companies. Every business row carries an
`organizationId`. A person (`Profile`) belongs to a company through a
`Membership` row, which holds their **role in that company** (ADMIN =
Management, STAFF = Sales, FACTORY) and whether they are its owner. One
person can belong to several companies with different roles.

Three layers enforce it; each works if another has a bug:

| Layer | Rule |
|---|---|
| Server code | The caller's company and role come **only** from `requireMembership()` (`lib/tenant.ts`). Data is read and written **only** through `tenantDb(organizationId)`, which scopes every query. Importing the raw Prisma client anywhere except `lib/tenant.ts`, `lib/platform/**` and `scripts/**` is a lint error. |
| Database | RLS on every table keyed on `current_org_id()`; every `SECURITY DEFINER` function checks the caller's company and Membership role; functions are not executable by default. |
| Billing state | A company that is `LOCKED` (trial ended / unpaid) or `DELETING` is read-only at the middleware, by trigger and by RLS. |

`Profile.role` is a legacy column — never use it for permissions. There
is no "default company": someone with no membership lands on
`/onboarding`. Per-company secrets (WhatsApp, Razorpay, Tally pairing)
are encrypted columns on `BusinessSettings`; environment variables hold
platform-level keys only. Details: [SECURITY.md](./SECURITY.md).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS + shadcn/ui; tokens in `packages/tokens` |
| Data | Prisma → Supabase Postgres; hand-written SQL migrations in `prisma/migrations` |
| Auth | Supabase Auth — emailed 6-digit code (and Google on web); TOTP for Management when a company requires it. No passwords. |
| Email | Resend |
| Payments | Razorpay — Syncit's own subscription billing, and each company's "Pay now" links |
| Monitoring | Sentry, `/api/health`, `CronRun` log at `/platform/crons` |
| Mobile | Expo Router, EAS Build / Update |
| Hosting | Vercel (web + crons) |

## Getting started

```bash
npm install
cp .env.example .env        # fill in a STAGING Supabase project — never production
node --env-file=.env node_modules/.bin/prisma migrate deploy
npm run dev
```

Mobile: `cd mobile && npm install && cp .env.example .env && npx expo start`.

Checks before any commit:

```bash
npx tsc --noEmit
npm run lint
npm test                    # see the note below
(cd mobile && npm run typecheck && npm run lint)
```

> **`npm test` and the database.** Four suites
> (`advance-order-status`, `create-sales-order-rules`,
> `rls.factory-rate-approval`, `rls.staff-isolation`) connect to whatever
> database `.env` names and create and delete rows there. Only run the
> full suite with `.env` pointing at staging or a throwaway project.

## Schema changes

Every change is a new folder in `prisma/migrations` **plus** the matching
edit to `prisma/schema.prisma`. Never edit an old migration. New tables
get RLS in the same file. Migrations must be idempotent and
**backwards-compatible for one release** — apply the migration first,
then deploy the code ([RUNBOOK → Rolling back a release](./docs/RUNBOOK.md#rolling-back-a-release)).

## Environments and operations

| Doc | For |
|---|---|
| [docs/ENVIRONMENTS.md](./docs/ENVIRONMENTS.md) | Production vs Preview (staging) vs local; which variable goes where |
| [`.env.example`](./.env.example) | Every variable with its purpose |
| [docs/RUNBOOK.md](./docs/RUNBOOK.md) | Alerts, uptime, crons, backups and restore test, rollback, Supabase Auth settings, sessions |
| [docs/LAUNCH.md](./docs/LAUNCH.md) | Launch checklist: every SY item, done or deferred |
| [SECURITY.md](./SECURITY.md) | Who can access what, and which layer enforces it |
| [docs/LOGIN-RUNBOOK.md](./docs/LOGIN-RUNBOOK.md) | "I can't sign in" in 60 seconds |
| [docs/NOTIFICATIONS.md](./docs/NOTIFICATIONS.md) | Push notifications and the `notify` edge function |
| [docs/MOBILE-RELEASE.md](./docs/MOBILE-RELEASE.md), [PLAY-STORE.md](./docs/PLAY-STORE.md), [APP-STORE.md](./docs/APP-STORE.md) | Shipping the app |

## Recovery module

Adds `/recovery` (today's follow-up list), `/escalations` (open ladder), and
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

1. Apply migrations (`prisma migrate deploy`)
2. Run `prisma/sql/2026-07-21-escalation-open-unique.sql` once in the
   Supabase SQL editor (partial unique index — one OPEN escalation per
   party).
3. Optionally set `ANTHROPIC_API_KEY` in Vercel env.
4. Redeploy so `vercel.json` registers the new cron.
5. Each staff member sends one WhatsApp to the business number to open
   Meta's 24h service window for free-form digest delivery.

Design spec: `docs/superpowers/specs/2026-07-21-recovery-backend-design.md`.
Implementation plan: `docs/superpowers/plans/2026-07-21-recovery-backend.md`.
