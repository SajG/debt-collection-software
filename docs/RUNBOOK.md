# RUNBOOK

Operational settings that live outside the repo — Supabase dashboard
toggles, DNS, cron config. Skimmed by whoever is on call. Also the
grab-bag of "why is it that way?" answers for things a first-time
reader will want to change and shouldn't.

## Sessions — how long does a sign-in last?

Two systems interact. Neither is in the repo alone.

### Supabase project settings (dashboard → Authentication → Settings)

Leave these at the values below. They are the reason a user who
opens the app at least once every 30 days stays signed in forever.

| Setting | Value | Why |
|---|---|---|
| **JWT expiry** | `3600` seconds (default) | Access token lifetime. Short so a stolen JWT dies in an hour. |
| **Refresh token rotation** | **Enabled** (default) | Every getSession() issues a new refresh token. Rotation is the SAFER setting — do not turn it off to "simplify". Rotation catches replay attacks. |
| **Refresh token reuse interval** | `10` seconds (default) | The window in which a rotated refresh token is still accepted. Covers network retries. |
| **Email OTP expiration** | `600` seconds (10 min) | Per SY-email. Users on slow inboxes need it; longer than that is attack surface. |

**Refresh token expiry: NONE, while rotation is happening.** The
practical consequence: as long as the app opens on this device at
least once per 30 days (Supabase's inactive-token cleanup window),
the user is signed in indefinitely. This is intentional. The
security gates are:

1. The device lock (biometric or PIN, evaluated on every cold start
   and every foreground after >5 min backgrounded — see
   `mobile/src/auth/device-lock.ts`).
2. The absolute session lifetime — 90 days, enforced by
   `AUTHENTICATED_SINCE_KEY` in `AuthContext.tsx`. Independent of
   Supabase; a hard cap regardless of activity.
3. Admin device revocation from `/admin/devices` — one click, kills
   every session for that user via `admin.signOut(user, "global")`.

**If someone asks "why isn't there a 7-day idle sign-out?":** we
removed it (SY-idle). The idle timeout punished users who took
leave; it did not defend the phone (the lock does that). Under the
old enrollment-code flow, hitting the idle timeout meant "wait for
an admin to issue you a new code." Now that email OTP is self-
service, we could bring the timeout back and it would be less
painful — but the security value is still marginal, so don't.

### Client-side (in code — for reference, do not tune from the dashboard)

- **Foreground keep-alive** — `AuthContext.tsx` calls
  `supabase.auth.getSession()` on every AppState `active` transition.
  This forces a refresh-token rotation each time the app comes to
  the foreground, so a user who taps the icon daily stays fresh
  even if they never do anything.
- **Absolute 90-day cap** — `ABSOLUTE_SESSION_MS`. Stamps
  `syncit:authenticatedSince` at `SIGNED_IN`. On any cold start
  past 90 days, everything is wiped and the user gets bounced to
  `/(auth)/email` for a self-service re-auth.

### Web session

Same 90-day absolute cap enforced by `middleware.ts` reading the
httpOnly `syncit_auth_since` cookie set by `loginAction`. No idle
timeout for parity with mobile.

## What the user experiences

- **Day 1:** open app → type email → type 6-digit code from inbox →
  set up fingerprint (or 6-digit PIN if no biometric hardware).
- **Day 2+:** open app → fingerprint → in. No sign-in step, no email.
- **After 5 minutes backgrounded:** fingerprint prompt again on next
  foreground. The Supabase session is still there — this is the
  local lock, not a re-auth.
- **After 90 days:** signed out. Type email → get a code → biometric
  again. No admin action needed.
- **Lost phone:** admin opens `/admin/devices`, finds the device,
  clicks **Revoke**, types the owner's name to confirm. Session
  dies on the next request from that phone. Owner enrols on a new
  phone via the same email flow.

## Finding out before customers do

Three signals, all ending in your inbox.

### 1. Sentry (errors)

Code side is done: server, edge and browser report to Sentry when
`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set; emails, cookies, headers
and request bodies are stripped before sending. Every event carries
`environment` = `production` or `preview`.

Dashboard side (once): Sentry → **Alerts → Create Alert**

| Alert | Type | Condition | Action |
|---|---|---|---|
| New issue | Issue alert | "A new issue is created", environment = All | Email → you. Action interval 5 minutes. |
| Error spike | Metric alert | Number of errors > 20 in 10 minutes, environment = production (warn at 10) | Email → you |
| Cron failed | Issue alert | "The event's tags match `scope` starts with `cron.`" | Email → you |

Also: Sentry → User Settings → Notifications → **Issue Alerts: On**,
**Deploy: Off**, and make sure the address is verified — an unverified
address silently receives nothing.

#### Prove the alerts work

```
# staging (preview is behind Vercel Authentication — add the bypass header)
curl -i https://<preview-url>/api/ops/sentry-test \
  -H "Authorization: Bearer $STAGING_CRON_SECRET" \
  -H "x-vercel-protection-bypass: $VERCEL_BYPASS_SECRET"
```

`200 {"sent":true,…}` means the event left the server; the "New issue"
email should arrive within 5 minutes. `503 {"sent":false}` means
`SENTRY_DSN` is not set in that environment. Each call makes a new issue
on purpose, so the alert fires every time. In production the endpoint
also needs `?confirm=production`.

### 2. Uptime monitor

`/api/health` answers `200` when Postgres, Supabase Auth and Resend all
answer, `503` otherwise, with `{status, checks:{database,auth,email}}`
(ok + latency only). Results are cached for 30 seconds.

Better Stack (free plan) → **Monitors → Create monitor**, three of them:

| URL | Expect | Every |
|---|---|---|
| `https://www.getsyncit.app/` | status 200 | 3 min |
| `https://www.getsyncit.app/login` | status 200 | 3 min |
| `https://www.getsyncit.app/api/health` | status 200 **and** keyword `"status":"ok"` | 3 min |

Alert by email (and phone push from the Better Stack app). Use the
`www.` host: the bare domain answers with a redirect. If you create a
Better Stack status page, put its URL in `NEXT_PUBLIC_STATUS_HISTORY_URL`
and `/status` links to it as "Uptime history".

`https://www.getsyncit.app/status` is the page to send a customer who asks
"is it down?". It runs the same three checks as `/api/health`.

### 3. Scheduled jobs

Every cron writes a `CronRun` row: start, duration, companies covered,
failures, status (`OK` / `PARTIAL` / `FAILED`). Read them at
**`/platform/crons`** (your email must be in `PLATFORM_ADMINS` and you
must have passed TOTP in that session; everyone else gets a 404). A job
whose last run is older than its schedule allows is marked **Late**.
Rows are kept 90 days.

| Job | Schedule (IST) |
|---|---|
| `notify-pending-approval` | every 10 minutes |
| `reconcile-orders` | 09:00 daily |
| `daily-followups` | 09:00 Mon–Sat |
| `weekly-summary` | 09:00 Monday |
| `trial-reminders` | 09:30 daily |
| `lifecycle` | 09:45 daily |
| `company-deletion` | 10:00 daily |
| `reminders` | 10:30 daily |
| `recovery` | 11:00 daily |

**Vercel plan.** Hobby allows a cron to run at most once a day and
refuses to deploy anything more frequent; the every-10-minutes job needs
**Pro**. The production deployment with that schedule is `READY`, which
is consistent with Pro — confirm at Vercel → Settings → Billing, and at
Settings → Cron Jobs that all nine are listed. Vercel schedules crons
for the Production deployment only.

If the project ever goes back to Hobby, move only that one job to
Supabase (SQL editor, production project) and delete its entry from
`vercel.json`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
select cron.schedule('notify-pending-approval', '*/10 * * * *', $$
  select net.http_get(
    url := 'https://www.getsyncit.app/api/cron/notify-pending-approval',
    headers := jsonb_build_object('Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
  );
$$);
```

The route, its CronRun logging and its `CRON_SECRET` check stay the same.

## Backups

### Turn on Point-in-Time Recovery

Supabase → production project → **Database → Backups → Point in Time**
→ enable (needs the Pro plan plus the PITR add-on; 7 days of retention is
enough). Without PITR you only have the nightly backup: up to 24 hours of
orders and payments can be lost. Staging does not need it.

Storage (order documents, payment proofs) is **not** covered by database
backups or PITR. Files are only removed by the company-deletion job.

### Monthly restore test (first Monday, about 30 minutes)

A backup that has never been restored is a hope, not a backup.

1. Supabase → production → Database → Backups → **Restore to a new
   project** (never "restore in place"). Pick a time about one hour ago.
   Name it `syncit-restore-test`.
2. When it is ready, in its SQL editor:
   ```sql
   select count(*) from "Organization";
   select count(*) from "SalesOrder";
   select max("createdAt") from "SalesOrder";
   select count(*) from "Payment";
   select max("startedAt") from "CronRun";
   ```
   Compare with the same queries on production. Counts should match to
   within the last hour; `max(createdAt)` should be close to the restore
   time you picked.
3. Check RLS survived: `select count(*) from pg_policies where schemaname = 'public';`
   must equal production.
4. **Delete `syncit-restore-test`** (it holds real customer data and
   costs money).
5. Write the date, the restore time chosen, how long it took and "OK" or
   what was wrong at the bottom of this file under "Restore test log".

### Restore for real

Only for data loss or corruption — never to undo a bad release (see
below). Restore to a **new** project, verify as above, then either copy
the missing rows back or switch the production env vars in Vercel to the
restored project and redeploy. Tell customers what window was affected.

## Rolling back a release

### Step 1 — put the last good build back (about 1 minute)

Vercel → Project → **Deployments** → the last deployment that was fine →
⋯ → **Instant Rollback** (or `vercel rollback <deployment-url>`).
Production traffic moves immediately; nothing is rebuilt. While a
rollback is active, new pushes to `main` do **not** go live until you
choose **Undo Rollback** / promote a deployment — so fix forward on a
branch, check the preview, then promote.

Mobile: an OTA update is rolled back with
`eas update:republish --channel production` ([MOBILE-RELEASE.md](./MOBILE-RELEASE.md)).
A store build cannot be recalled — raise `mobileMinAppVersion` only once
a fixed build is live.

### Step 2 — the database is NOT rolled back

Instant Rollback changes code only. That is safe because of one policy:

> **Every migration must be backwards-compatible for one release.**
> The previous release's code must keep working against the new schema.

In practice:

| Change | Do | Don't |
|---|---|---|
| New column | add it nullable or with a default | add `NOT NULL` without a default |
| New table / index / function | fine | — |
| Remove a column or table | release N: stop reading and writing it. Release N+1: drop it | drop it in the same release that stops using it |
| Rename | add new → write both → backfill → read new → drop old, over two releases | `RENAME COLUMN` |
| Tighten (NOT NULL, new CHECK, narrower enum, stricter RLS) | release N: make the code comply. Release N+1: add the constraint | add it together with the code that needs it |
| Change a function's arguments | add the new signature next to the old one | replace in place |

Order of a release: **apply the migration first, then deploy the code.**
(New code against an old schema fails: Prisma selects every column it
knows about.) Old code against the new schema works, by the policy above —
which is exactly the state an Instant Rollback puts you in.

There are no "down" migrations and none should be written: a down script
that drops a column also drops whatever customers saved in it since the
release. If a migration itself is wrong, write a **new** forward migration
that corrects it. If it destroyed data, that is a restore (above).

### After any rollback

1. `/api/health` is 200 and `/platform/crons` shows no new FAILED runs.
2. Sentry: the issue that caused the rollback has stopped receiving events.
3. Note what happened under "Incident log" below.

## Supabase Auth settings

Dashboard → Authentication. Same values on production and staging.

| Where | Setting | Value | Why |
|---|---|---|---|
| Providers → Email | Enable email provider | On | sign-in codes |
| Providers → Email | Email OTP expiration | `600` seconds | `scripts/apply-supabase-auth-config.mjs` sets this |
| Providers → Email | Email OTP length | 6 | the forms accept exactly six digits |
| Providers → Email | Confirm email | On | |
| Providers → Email | Secure email change | On | |
| Providers → Email | **Prevent use of leaked passwords** | **Off** | there are no passwords: web and mobile sign in with an emailed code (or Google). The check needs Pro and would guard nothing. Turn it on if passwords ever return. |
| Sign In / Providers | Allow new users to sign up | On | self-serve sign-up needs it; every *other* path passes `shouldCreateUser:false`, and `SIGNUP_ENABLED` is the real switch |
| Providers → Phone | | Off | |
| Rate Limits | Emails sent | at least `100` per hour | with custom SMTP the default is 30/hour for the **whole project** — at launch that is the first thing to run out, and people stop receiving codes |
| Rate Limits | OTP / magic-link requests | `30` per 5 minutes per IP (default) | |
| Rate Limits | Token verifications | `30` per 5 minutes per IP (default) | |
| Rate Limits | Sign-ups and sign-ins | `30` per 5 minutes per IP (default) | |
| Rate Limits | Token refreshes | `150` per 5 minutes per IP (default) | mobile refreshes on every foreground |
| Attack Protection | CAPTCHA | Off | would break the mobile app's sign-in |
| SMTP | Custom SMTP | Resend, sender `login@getsyncit.app` | the built-in mailer is capped at a few emails an hour |
| URL Configuration | Site URL | `https://getsyncit.app` (staging: the preview URL) | |

On top of Supabase's limits the app has its own:

| Path | Limit | Where |
|---|---|---|
| `/login/*`, `/api/auth/*` (incl. `request-code`) | 10 requests / minute / IP | `middleware.ts` |
| `/signup` form posts | 10 / minute / IP | `middleware.ts` (SY40) |
| Sign-up code requests | 5 / hour / IP, 20 / hour / email domain | `SignupAttempt` table, `signup/actions.ts` |
| Sign-in code requests | 3 / 15 minutes / email | `checkEmailOtpSendLimit` |
| Wrong codes | 5 / 15 minutes / email | `checkLoginRateLimit` |

The middleware limit is per server instance and best-effort; for a
distributed flood use Vercel → Firewall → Attack Challenge Mode.

## Restore test log

| Date | Restored to (time) | Took | Result |
|---|---|---|---|
| _none yet_ | | | |

## Incident log

| Date | What customers saw | Cause | Fix | Rolled back? |
|---|---|---|---|---|
| _none yet_ | | | | |

## Other operational settings

_(to fill in as they matter — for now, the sessions story is what
was most-often refactored the wrong way)_
