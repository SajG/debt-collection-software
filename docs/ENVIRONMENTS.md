# Environments

Three places Syncit runs, and which backing services each one may touch.
Variable-by-variable purpose: [`.env.example`](../.env.example).
Operations (alerts, backups, rollback): [RUNBOOK.md](./RUNBOOK.md).

| | **Production** | **Preview (staging)** | **Local** |
|---|---|---|---|
| Where | `www.getsyncit.app` (Vercel Production, branch `main`) | every other branch / PR on Vercel | `npm run dev` |
| Supabase project | `syncit-prod` | `syncit-staging` — **a separate project** | staging (or a personal project) |
| Real customers | Yes | **Never** | Never |
| Resend | live key, domain `getsyncit.app` | separate key, or none (email is skipped) | none |
| Razorpay (Syncit billing) | `rzp_live_*` | `rzp_test_*` | `rzp_test_*` |
| PostHog | production project | none, or a staging project | none |
| Sentry | same project, environment `production` | same project, environment `preview` | off |
| Crons | run on schedule | **do not run** (Vercel only schedules Production) | call by hand |
| Who can open it | anyone | Vercel Authentication (team members only) | you |

## The one rule

**Preview never uses the production Supabase project.** A preview runs
unreviewed code: it can execute against a schema it does not match, send
real customers reminders, or turn a test sign-up into a real company.

Two things enforce it:

1. **Vercel scoping.** Every variable below marked "different" is saved
   twice in Vercel — once ticked *Production* only, once ticked *Preview*
   only. Never tick both boxes for those.
2. **A guard in the code.** `PRODUCTION_SUPABASE_REF` holds the production
   project ref and is set in **all** environments. On a Preview, if
   `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL` or `DIRECT_URL` contains it,
   the server refuses to start (`lib/platform/env-guard.ts`, called from
   `instrumentation.ts`) and the deployment log says why. If the variable
   is missing on a Preview, the log carries an `[env-guard]` warning.

## One-time setup of staging

1. Supabase → **New project** `syncit-staging`, region Mumbai, free plan is fine.
2. Apply the schema. Put the staging `DATABASE_URL` / `DIRECT_URL` (and the
   other staging values) in a local `.env.staging`, then
   `node --env-file=.env.staging node_modules/.bin/prisma migrate deploy`.
   This replays every file in `prisma/migrations` — tables, RLS policies and
   functions — so staging matches production. (Not `db push`: that creates
   tables but none of the RLS or functions.) This has not been run from zero
   yet; if an early migration fails, stop and fix that before going further.
3. Auth settings: same as production — [RUNBOOK → Supabase Auth settings](./RUNBOOK.md#supabase-auth-settings).
   `node --env-file=.env.staging scripts/apply-supabase-auth-config.mjs` sets the OTP expiry.
4. Seed something to look at: copy `.env.staging` over `.env` temporarily, or
   run the seed script with `--env-file=.env.staging` (see `review:seed` in
   `package.json`). It creates the invented "Syncit Demo" company.
5. Vercel → Project → Settings → Environment Variables: add the Preview
   values from the table below.
6. Vercel → Settings → Deployment Protection: keep **Vercel Authentication**
   on for previews (it is today). To call a preview from `curl` or an uptime
   monitor, create a **Protection Bypass for Automation** secret and send it
   as the `x-vercel-protection-bypass` header.
7. Push any branch and open the preview: sign-up should create a company in
   the *staging* project only.

## Variables per environment

"Different" = a different value in Production and Preview. "Same" = one
value, both boxes ticked. "—" = leave unset.

### Must differ

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | staging |
| `DATABASE_URL` | prod pooled (6543) | staging pooled |
| `DIRECT_URL` | prod direct (5432) | staging direct |
| `APP_ENCRYPTION_KEY` | prod key | a different key |
| `CRON_SECRET` | prod secret | a different secret |
| `STATUS_LINK_SECRET` | prod secret | a different secret |
| `TALLY_SYNC_SECRET` | prod secret | a different secret |
| `NEXT_PUBLIC_APP_URL`, `APP_URL` | `https://getsyncit.app` | the branch URL, or leave unset |
| `RAZORPAY_PLATFORM_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET` | `rzp_live_*` | `rzp_test_*` |
| `RAZORPAY_PLATFORM_PLAN_*` (4) | live plan ids | test plan ids |
| `RESEND_API_KEY` | live key | separate key, or — |
| `REVIEW_LOGIN_EMAILS`, `REVIEW_LOGIN_CODE` | only while a store review is open | freely |

### Same in both

| Variable | Note |
|---|---|
| `PRODUCTION_SUPABASE_REF` | the guard above — must be present on Preview |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | events are tagged with the environment automatically |
| `EMAIL_FROM` | |
| `BILLING_*` (7) | seller block on Syncit's invoices |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | |
| `SIGNUP_ENABLED` | may be `true` on Preview before it is on Production |

### Production only

| Variable | Why not on Preview |
|---|---|
| `PLATFORM_ADMINS` | operator console — set on Preview only if you want to test it there |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | test traffic would pollute the funnel |
| `ANDROID_LIVE`, `IOS_LIVE`, `IOS_APP_STORE_URL` | store buttons |
| `WHATSAPP_*`, `MSG91_*` | a preview must not message real phones |
| `ANTHROPIC_API_KEY` | cost; the rules-based fallback is used without it |
| `NEXT_PUBLIC_STATUS_HISTORY_URL` | |
| `ZOHO_*`, `QUICKBOOKS_*`, `XERO_*`, `RAZORPAY_KEY_*`, `RAZORPAY_WEBHOOK_SECRET` | only if those integrations are in use |

### Never on Vercel

`AUTH_SKIP_MFA`, `SUPABASE_ACCESS_TOKEN`, any `EXPO_PUBLIC_DEV_TEST_*`.

## Mobile (EAS)

The store build always talks to production. Variables live in EAS, not
Vercel — see [MOBILE-RELEASE.md](./MOBILE-RELEASE.md) and
`mobile/.env.example`. To test the app against staging, use the `preview`
EAS profile with the staging `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` and a preview deployment as
`EXPO_PUBLIC_APP_URL`.

## Supabase edge function

`supabase/functions/notify` reads `NOTIFY_SHARED_SECRET`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from **Supabase** secrets
(`supabase secrets set …`), per project. Deploy it to staging and
production separately — see [NOTIFICATIONS.md](./NOTIFICATIONS.md).
