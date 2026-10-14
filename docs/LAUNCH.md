# Launch checklist

Status of every SY19–SY40 item, as of **2026-10-07**. "Done" means the
code is in the repository and its checks pass — not that it is live.
Whether it is live is the first section.

Legend: **Done** · **Done, not live** (needs the migration and/or a
deploy) · **Deferred** (with the reason) · **No record** (nothing in the
code, migrations or notes names this item — fill it in or delete the row).

## 0. Blockers — production is broken today

Checked 2026-10-07, read-only.

| # | What | Evidence | Fix |
|---|---|---|---|
| B1 | **The production database is five migrations behind the deployed code.** `/dashboard` throws for signed-in users. | `_prisma_migrations` on the production project ends at `20260930100000_tally_connector_pairing` (SY27). The live deployment (`79244be`, 3 Oct) contains the SY28–SY35 schema. Vercel runtime errors: `The column Profile.deletedAt does not exist` on `/dashboard`, 9 times, last 2026-10-07 08:52 UTC. | Apply the pending migrations in order (§3). Take a backup first. |
| B2 | **SY33 database lock-down is not applied in production.** Until it is, the functions in `public` are executable by `anon` / `authenticated` as they were before SY33, and the company checks inside them are the old ones. | Same migration list: `20261003000000_sy33_rpc_tenant_guards` is absent. | Same as B1. |
| B3 | **Push notifications cross companies.** `supabase/functions/notify` picks recipients for order-comment, credit and stale-order pushes by `Profile.role` with no company filter. | Read of the function, SY29. Not fixed (not asked). | Filter recipients by Membership in the order's company, redeploy the function. Half a day. |
| B4 | Everything since SY28 is uncommitted on one machine (about 250 changed files on `main`). | `git status`. | Commit and push; from then on, branch + preview. |
| B5 | No staging project exists; previews (if any use the shared variables) point at production. | Vercel env list could not be read with the available access. | [ENVIRONMENTS.md](./ENVIRONMENTS.md) one-time setup. |

Do B1 before anything else in this file.

## 1. Items

| Item | What | Status | Note |
|---|---|---|---|
| SY19 | — | **No record** | Not named anywhere in code, migrations or notes. |
| SY20 | Device registration short-circuit in RLS (mentioned once, inside the SY22 migration) | **No record** of its own | The behaviour is preserved by SY22; nothing separate to launch. |
| SY21 | Multi-company schema: `Organization`, `Membership`, `organizationId` on every business table | **Done**, live | Migration applied. |
| SY22 | Company-scoped RLS; crons run company by company | **Done**, live | Migration applied. |
| SY23 | Self-serve sign-up, 14-day trial, onboarding, per-company 2FA for Management | **Done**, live | Sign-up stays closed until `SIGNUP_ENABLED=true`. |
| SY24 | Per-company brands / packings / products; factory rate visibility; role labels | **Done**, live | |
| SY25 | Sidebar by task; design tokens; no raw colours | **Done**, live | Hex-colour lint is a warning, about 110 remain in older files. |
| SY26 | Marketing site, legal pages, robots, sitemap | **Done**, live | Placeholders (addresses, numbers) still need your sign-off. |
| SY27 | Tally connector: per-company pairing, download | **Done**, live | Last migration production has. |
| SY28 | Subscription billing (Razorpay), GST invoices, LOCKED = read-only | **Done, not live** | Code deployed, migration not applied (B1). Live Razorpay keys and plan ids not confirmed. |
| SY29 | Statement of account, promises / "Needs you", 9:00 push, Monday email, pre-due reminders, Pay now | **Done, not live** | Uncommitted. `notify` function must be redeployed. Never run end to end. |
| SY30 | — | **No record** | |
| SY31 | Web: company and role from Membership only; no default company; `SIGNUP_ENABLED` | **Done**, deployed | Mobile still chooses its home screen from `Profile.role` — **Deferred**: needs a mobile release; workaround in LOGIN-RUNBOOK. |
| SY32 | All server data access through `tenantDb`; raw client is a lint error | **Done**, deployed | |
| SY33 | Company checks in every database function; EXECUTE closed by default | **Done, not live** | B2. |
| SY34 | Failed renewal → 7-day grace → read-only; cancel at period end | **Done, not live** | Migration not applied. |
| SY35 | Delete account, delete company (30 days), platform audit log | **Done, not live** | Migration not applied — this is the column production is failing on. The `/platform` console itself did not exist; SY40 adds its first page. |
| SY36 | Mobile field UX: role tabs, Today, Hindi / Marathi, app lock, accessibility | **Done, not live** | Uncommitted; migration not applied; never run on a device; hi/mr text not reviewed by a native speaker. |
| SY37 | Store preparation: config, reviewer sign-in, listings, release doc | **Done, not live** | `eas init` and the production build not done (EAS not logged in on this machine). |
| SY38 | PostHog, lifecycle emails, /help, tools, industries, blog, referrals | **Done, not live** | Uncommitted; migration not applied; PostHog and emails not verified with real keys; content needs your read. Referral month for an already-paying company is manual. |
| SY39 | — | **No record** | `.env.example` was asked to cover "SY31–SY39"; every variable the code reads is now listed, whichever item introduced it. |
| SY40 | This item — see §2 | **Done in code; dashboard steps open** | |

## 2. SY40 in detail

| Part | Status | Note |
|---|---|---|
| Preview never uses production data | **Code done; setup open** | Guard refuses to start a Preview on the production project once `PRODUCTION_SUPABASE_REF` is set. Creating the staging project and scoping variables is yours. |
| `docs/ENVIRONMENTS.md`, `.env.example` complete | **Done** | Every `process.env.*` in web code is in `.env.example`; mobile in `mobile/.env.example`. |
| Sentry alerts to email | **Open (dashboard)** | Rules to create: RUNBOOK → Sentry. Events now carry a `scope` tag for the cron rule. |
| `/api/health` (database + sign-in + email) | **Done, not live** | |
| Uptime monitor on `/`, `/login`, `/api/health` | **Open (dashboard)** | RUNBOOK → Uptime monitor. |
| `/status` page | **Done, not live** | Reads the same check as `/api/health`. |
| 10-minute cron needs Vercel Pro | **Likely fine; confirm** | Production deployed with that schedule, which Hobby refuses. Billing page not readable with the access available. pg_cron fallback is written in the RUNBOOK. |
| Approval nudge actually sends | **Fixed, not live** | It never worked: the cron sent a shape and header the `notify` function refused. Both sides fixed; function must be redeployed. |
| `CronRun` row per cron, visible in `/platform` | **Done, not live** | Migration `20261010000000_sy40_cron_run`; `/platform/crons` needs `PLATFORM_ADMINS`. |
| Supabase PITR | **Open (dashboard, paid add-on)** | |
| Restore test + rollback procedure + migration policy | **Done** | RUNBOOK. First restore test not yet performed. |
| Security headers | **Verified** on the live site 2026-10-07 | Table in SECURITY.md. |
| Rate limits `/signup`, `/api/auth/request-code` | **Done** | request-code was already limited (10/min/IP + 3 per email per 15 min); sign-up already had 5/hour/IP; SY40 adds the burst cap on `/signup` posts. |
| Supabase Auth settings | **Open (dashboard)** | Values in RUNBOOK. Watch "Emails sent per hour". |
| README, SECURITY.md, LOGIN-RUNBOOK for multi-company | **Done** | |
| Intentional staging error → Sentry email within 5 minutes | **Not done** | Needs staging and the alert rule. Endpoint and command are ready: RUNBOOK → "Prove the alerts work". |

## 3. Order of work to go live

1. **Back up production** (Supabase → Database → Backups → create / confirm today's).
2. Commit everything; push.
3. Apply migrations to production, in order, checking each:
   `20261001000000_sy28_billing`, `20261003000000_sy33_rpc_tenant_guards`,
   `20261004000000_sy34_billing_grace`, `20261005000000_sy35_deletion_and_platform`,
   `20261006000000_sy36_mobile_field_ux`, `20261007000000_sy37_review_login`,
   `20261008000000_sy29_daily_plan_pref`, `20261009000000_sy38_growth`,
   `20261010000000_sy40_cron_run`.
   (`prisma migrate deploy` with production `DIRECT_URL`. The history table
   shows two migrations that were rolled back and re-applied in September, so
   read its output rather than assuming.)
4. Open `/dashboard` as a real user: B1 is fixed when it loads. Check Vercel
   runtime errors stop.
5. Set the new variables (ENVIRONMENTS.md), including `PRODUCTION_SUPABASE_REF`
   and `PLATFORM_ADMINS`; deploy.
6. Redeploy the `notify` edge function (after fixing B3).
7. `/api/health` → 200; `/platform/crons` shows runs arriving; uptime monitors on.
8. Create staging; point Preview at it; run the Sentry test there.
9. Enable PITR; do the first restore test; write it in the RUNBOOK log.
10. Only then: `SIGNUP_ENABLED=true`, store submissions.

## 4. Open risks carried past launch (Deferred)

| Risk | Why deferred | Revisit |
|---|---|---|
| Mobile home screen from `Profile.role` | Needs a store build | With the first store release |
| Four test suites write to whatever database `.env` names, and currently fail | Need a staging database to be rewritten against | Right after staging exists |
| `/api/uploads/document` cannot be reached by the mobile app's bearer token | Found in SY29; not asked to fix | Before the mobile release |
| In-memory rate limiter is per server instance | Good enough for single-source floods; Vercel Attack Challenge Mode covers the rest | If abuse is seen |
| Marketing pages render per request (needed by the script policy) | Correctness over caching | If traffic makes it costly |
| Referral free month for a paying company is applied by hand | Razorpay cannot credit a running subscription automatically | When referrals happen |
