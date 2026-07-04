# PayTrack — AR & Payment Follow-up for MSME Distributors

A B2B accounts-receivable tool for Indian MSME distributors who sell goods on credit. Tracks buyers, outstanding invoices, payment history, and drives follow-up workflows.

## Deploy model

**One Supabase project = one distributor.**

Each customer gets their own deployment pointing at their own Supabase project. There is no shared database and no multi-tenancy — this is intentional. Isolation is at the infrastructure level, not row-level.

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
