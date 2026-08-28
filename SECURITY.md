# SECURITY

Small, closed-user-base trust model. This is what stops a single lost
phone or a single compromised session from turning into a data
incident, and what to do when it happens.

## Known past exposure — team-bootstrap password backdoor

**Window:** from the first prod run of `scripts/enable-test-login.ts`
(now deleted) up to and including the rotation on **2026-08-27**.

**What was exposed.** `scripts/enable-test-login.ts` set every user in
`prisma/team.ts` to a Supabase Auth password equal to their own E.164
phone number, attached to a synthetic email `<10-digit>@synworks.local`.
`mobile/src/auth/test-login.ts` shipped a client shortcut
(`TEST_LOGIN_CODE = "123456"`) that used the same credentials via
`signInWithPassword`. Neither the shortcut nor the underlying password
grant was `__DEV__`-gated — both worked in every build, including
release APKs distributed to the 15 users in `TEST_LOGIN_PHONES`.

**Impact.** Anyone who knew a team member's phone number could obtain
a fully authenticated Supabase JWT for that user's role — including
ADMIN — either from within the app (typing the number + `123456`) or
from any machine on the internet via a direct password-grant POST to
`/auth/v1/token`. RLS did not mitigate this because Supabase issued
real, correctly-signed sessions.

**Remediation (2026-08-27).**

1. Deleted `mobile/src/auth/test-login.ts`, `scripts/enable-test-login.ts`,
   and the `enable:test-login` package script. Stripped every caller in
   `mobile/app/(auth)/{phone,verify}.tsx`.
2. Ran `scripts/rotate-compromised-passwords.ts --commit` against
   production, which for every affected user: (a) set a fresh 256-bit
   cryptographically-random password known to nobody, (b) detached the
   `@synworks.local` synthetic email, (c) invalidated every existing
   refresh token via `admin.signOut(user.id, "global")`.
3. All 15 users were signed out globally and had to re-enrol via the
   new device-enrollment flow (SY1). No user metadata, no application
   data, and no domain rows were altered.

**Why the record stays.** Being able to see this later matters more
than the file looking clean. If you are reading this because you found
a `@synworks.local` reference in git history: the credentials it
pointed to no longer exist on the Supabase side.

## Known past exposure — `redeem_and_mint_session` RPC

**Window:** from the first prod deploy of the SQL-mint enrollment
flow (SY1-b) up to and including the cleanup rotation on
**2026-08-28**.

**What was exposed.** `public.redeem_and_mint_session(phone, code,
device jsonb)` was anon-callable and SECURITY DEFINER. On every
successful redeem it:

1. Attached a synthetic email `<profile-uuid>@device.paytrack.local`
   to the auth user (if not already set).
2. Generated a 32-byte random password and wrote
   `extensions.crypt(pw, extensions.gen_salt('bf'))` directly into
   `auth.users.encrypted_password`.
3. Returned the plaintext password back to the mobile client so it
   could immediately call `signInWithPassword`.

The RPC and the client both treated the credential as "one-shot" —
the app used it once and threw it away. But the Supabase row keeps
`encrypted_password` valid indefinitely. Anyone who intercepted a
plaintext (mobile TLS breakage, MITM on a compromised device,
Sentry breadcrumb leak, log-drain misconfig) could reuse it days
later to obtain a fresh JWT via
`/auth/v1/token?grant_type=password`, on the synthetic email the
same RPC had set.

**Impact.** Same shape as the SY0 exposure: a leaked plaintext →
any-role JWT on the target user, until the password was rotated
out. Distinct from SY0 in that the plaintext was fresh per
enrolment (not "same as the phone number"), so this only threatens
users who actually enrolled during the SQL-mint window, and only
if their plaintext leaked. Every user who enrolled between SY1-b
and SY-email is on that list.

**Remediation (2026-08-28).**

1. Dropped `redeem_and_mint_session`, `redeem_enrollment_code`,
   `issue_enrollment_code`, and the `EnrollmentCode` table
   (migration `20260828060000_email_otp_signin`). The whole
   anon-callable + SECURITY DEFINER + writes-to-auth surface is
   gone.
2. Migrated every user to Supabase's native email OTP —
   `signInWithOtp` + `verifyOtp`, `shouldCreateUser: false` as
   the allowlist gate. See SY-email.
3. Ran `npm run rotate:compromised -- --commit` (extended for this
   exposure) against production, which for every affected user:
   (a) set a fresh 256-bit cryptographically-random password known
   to nobody, (b) replaced any `@synworks.local` /
   `@device.paytrack.local` / `@invalid.local` email with the real
   `Profile.email` collected via SY11 backfill,
   (c) invalidated every existing session via
   `admin.signOut(user.id, "global")`.
4. `verify-emails.ts` (`npm run verify:emails`) is the gate that
   runs BEFORE any future rotation — it refuses to proceed unless
   every active Profile carries a real deliverable address, so
   we never re-invent a `@device.paytrack.local` handle.

**Why the record stays.** Same reason as SY0 — see the section
above.


## Who can access what

| Role | Sees | Writes |
|---|---|---|
| **ADMIN** | Everything — every party, invoice, payment, order, user. | Anything except: cannot deactivate self; cannot deactivate or demote the last active ADMIN (`_profile_guard_last_admin` trigger). |
| **STAFF** (salesperson) | Only Parties where `assignedToId = auth.uid()` and every Invoice / Payment / Message / Action / SalesOrder / OrderStatusEvent / OrderDocument / OrderComment / DispatchLot that hangs off those parties or orders. | Their own rows only. Can attach only `ORDER_PROOF` and `OTHER` docs (not `INVOICE` or `LORRY_RECEIPT`). |
| **FACTORY** | Every SalesOrder + every OrderDocument + every Party (needed for dispatch decisions). No Payments, no Messages. | Only `SalesOrder.currentStatus` and `expectedProductionDate` (enforced by `enforce_factory_sales_order_update` trigger). Can attach any doc type. |
| **Deactivated** (`isActive = false`) | Nothing. `current_user_role()` returns NULL for them, which every domain policy denies against. | Nothing. Same reason. Push tokens are deleted the moment `isActive` flips (see `_profile_after_deactivate` trigger). |
| **Anonymous** | Nothing on data tables. Only `is_provisioned_phone` and `check_phone_otp_rate_limit` are anon-callable, both by design (cost control on OTP send). | Nothing. |

## Which layer enforces it

Each rule is implemented at at least two layers so a bug in the
application still can't cross-read. The failing layer is listed with a
worked example.

- **Database RLS** — the primary boundary. Even a JWT that was somehow
  hand-crafted for a non-existent user gets zero rows because
  `current_user_role()` returns NULL. Every policy on Party / Invoice /
  Payment / Message / Action / SalesOrder / OrderStatusEvent /
  OrderDocument / OrderComment / DispatchLot / StockItem / Product /
  NotificationConfig / PaymentDocument gates on that function. Storage
  buckets `order-documents` and `payment-proofs` are private and gated
  the same way.
- **Server-side authz** — `lib/authz.ts` mirrors RLS. `requireProfile`
  redirects to `/account-disabled` when `isActive = false`.
  `requireAdmin` + `requireFactoryOrAdmin` gate the mutating server
  actions. `partyScopeWhere` and `canAccessParty` are static-mirrors of
  the RLS predicates — the vitest suite `party-scope.test.ts` asserts
  they do not drift.
- **Mobile `AuthContext`** — signs a session out on load if the Profile
  is missing, the role is unknown, or `isActive = false`. `PushToken`
  rows for that user are deleted server-side via
  `_profile_after_deactivate` regardless of whether the mobile app
  cooperates.
- **Rate limits** — Postgres RPCs `check_phone_otp_rate_limit`,
  `check_order_create_rate_limit`, `check_document_upload_rate_limit`
  cap the noisy write paths at 5 OTP fails / 30 orders / 60 uploads
  per hour per user. Wired into `create_sales_order`,
  `uploadOrderDocumentAction`, and `uploadPaymentDocumentAction`.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` — server-only. Two allowed usages:
  `lib/supabase/admin.ts` and `lib/__tests__/rls.staff-isolation.test.ts`.
  Never imported into anything with `EXPO_PUBLIC_` prefix, never sent
  to the browser, never bundled with mobile.
- `TALLY_SYNC_SECRET` — bearer token for the on-prem sync agent. Never
  compared with `===`; every route uses `lib/auth/verify-bearer.ts`
  which does a length-checked `timingSafeEqual`.
- `CRON_SECRET` — same rules, same helper.
- `NOTIFY_SHARED_SECRET` — set as a Supabase Function Secret; DB stores
  a copy in `NotificationConfig.edgeFunctionSecret`. **Not readable via
  RLS** — the `notification_config_select_admin` policy is dropped
  (migration `20260821180000_security_hardening`). The admin UI shows
  only a "configured / not configured" boolean via
  `is_notification_config_ready()`.
- `WHATSAPP_APP_SECRET` — HMAC verify on every POST to
  `/api/webhooks/whatsapp`; the route fails closed (500) when the
  secret is absent so nothing anonymous can write Messages.
- `EXPO_PUBLIC_DEV_TEST_*` — the mobile dev shortcut. Expo inlines
  every `EXPO_PUBLIC_*` string at build time. `mobile/scripts/assert-no-dev-secrets.mjs`
  runs before every EAS build and fails the build if any
  `EXPO_PUBLIC_DEV_TEST_*` is set in a `production` or `release`
  profile.

### Rotation schedule (SY7)

Every server-side secret in the table below rotates on a **90-day**
cadence. Anniversary dates are anchored to first-issue so we don't
end up rotating five secrets in the same week.

| Secret | Anchor | Where it lives | How to rotate |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 2026-08-27 | Supabase project settings + Vercel env + `.env.local` | Supabase dashboard → Project settings → API → "Reset service_role JWT" → update env in every consumer (Vercel, EAS secrets, local `.env`). Redeploy web + rerun any long-lived cron. |
| `TALLY_SYNC_SECRET` | 2026-08-27 | Vercel env + on-prem Tally connector `.env` | Generate 32 random bytes → `openssl rand -base64 32`. Set in Vercel; deploy. Then SSH into the on-prem PC and update `tools/tally-connector/.env`; restart the Windows service. |
| `CRON_SECRET` | 2026-08-27 | Vercel env only | `openssl rand -base64 32` → Vercel; redeploy so `/api/cron/*` picks up the new value. Vercel cron config uses the env directly — no separate update. |
| `NOTIFY_SHARED_SECRET` | 2026-08-27 | Supabase Function Secret + `NotificationConfig` row | `openssl rand -base64 32`. `supabase secrets set NOTIFY_SHARED_SECRET=<new>`; also `UPDATE "NotificationConfig" SET "edgeFunctionSecret" = <new>` via SQL editor (the column is not client-readable — see below). |
| `WHATSAPP_APP_SECRET` | Value from Meta App Dashboard | Vercel env | Regenerated in Meta dashboard → copy → Vercel env → redeploy. WhatsApp doesn't rotate on schedule; do this when Meta prompts or on a suspected leak. |
| `APP_ENCRYPTION_KEY` | 2026-08-27 | Vercel env only | **Coordinated migration** — encrypts WhatsApp token / bank account / OAuth refresh at rest. Rotating requires re-encrypting every row: SELECT + decrypt with old key + encrypt with new key + UPDATE, all in one transaction. Do this in a scheduled window, not on a whim. Bump the anchor date in this table after each rotation. |
| `SITE_ACCESS_TOKEN` | — | REMOVED (SY7) | Deleted. Vercel deployment protection replaces it. |

**Reminder**: bump the anchor column when you rotate. A missing bump
means the next auditor thinks the secret is stale when it isn't.

### CI: secret scanner

`.github/workflows/secret-scan.yml` runs **gitleaks** on every PR and
every push to `main`. A committed key of any recognised shape fails
the workflow. Configure custom patterns in `.gitleaks.toml` at the
repo root; the workflow reads it automatically.

## Sessions

- **Mobile — email OTP, one active device per user (SY-email)** —
  No SMS. No admin-issued enrollment codes. The user types their
  email in `/(auth)/email`; Supabase sends a 6-digit token via the
  configured SMTP provider; the user types it in `/(auth)/code`
  and `verifyOtp({ type: 'email' })` issues the JWT. The mobile
  app then calls `register_device()` which inserts a Device row
  and revokes any prior device for that profile (one-active-
  device invariant). Biometric or 6-digit PIN unlocks on every
  cold start and every foreground after >5 min backgrounded — see
  `mobile/src/auth/device-lock.ts`. Deep runbook:
  `docs/LOGIN-RUNBOOK.md`.
- **Allowlist gate.** `signInWithOtp({ email, options: {
  shouldCreateUser: false } })` is how "only admins decide who
  uses the app" is enforced. Any address the admin never invited
  gets no code — silently, so there is no oracle for whether an
  email is known.
- **No idle sign-out (SY-idle).** The former 7-day idle timeout
  was removed. It only punished users who took leave — the device
  lock is what protects a lost phone. `syncit:lastActiveAt` is
  still written on every foreground for the Device.lastSeenAt
  heartbeat (`touch_device_seen`), but never triggers a sign-out.
- **Refresh-token keep-alive.** Every AppState 'active' transition
  calls `supabase.auth.getSession()`, which rotates the refresh
  token. As long as the user opens the app once per Supabase's
  refresh TTL (30 d default), they stay signed in indefinitely.
  Full behaviour + dashboard settings in `docs/RUNBOOK.md`.
- **Web** — email + password + **mandatory TOTP for the ADMIN role**
  (SY2), OR alternative email OTP path (SY-email) via the "Email me
  a code instead" link on `/login`. ADMIN accounts on the email-OTP
  path are STILL bounced through `/login/challenge` for TOTP before
  reaching `aal2` — `requireAdmin()` is factor-agnostic. Session
  assurance:
  - `aal1` = password / email code only. Every fresh sign-in
    starts here.
  - `aal2` = above + verified second factor challenge.
  `requireAdmin()` and `requireProfileApi({ adminOnly: true })`
  refuse `aal1` and either send the user to `/login/challenge`
  (if a verified factor exists) or `/settings/security` (if not).
  MFA is currently ADMIN-only — STAFF and FACTORY may enrol from
  `/settings/security` but are not required to.
- **Recovery codes** — at TOTP enrolment, 8 single-use codes are
  generated server-side, shown to the user exactly once, and
  stored in `RecoveryCode` as SHA-256 hashes. Consumption is
  one-shot via the `consume_recovery_code` SECURITY DEFINER RPC
  (granted to service_role only — the browser never touches it).
  Redeeming a recovery code drops the session and requires the
  user to re-enrol TOTP from `/settings/security`; recovery is an
  escape hatch, not a durable factor.
- **Rate limit** — `LoginAttempt` carries a `factor` column
  (`PASSWORD | TOTP | RECOVERY | EMAIL_OTP`). Each factor has its
  own 5-fails-in-15-minutes freeze; a fumbled password does not
  burn the MFA-code budget. Email OTP has an additional
  send-side cap: 3 sends per email per 15 min
  (`checkEmailOtpSendLimit`), counting successful sends too — a
  successful send still burns provider quota. Per-IP burst
  limiting on `/login` + `/login/*` sub-paths + `/api/auth/*`
  lives in `middleware.ts` (10 req / 60 s / IP).
- **Absolute session floor (SY7)** — every session is torn down
  after **90 days** regardless of activity. Mobile stamps
  `syncit:authenticatedSince` at `SIGNED_IN` (never at
  `TOKEN_REFRESHED`) and checks it on every cold start; web
  stamps an httpOnly `syncit_auth_since` cookie at successful
  login and the middleware compares on every request. With
  SY-email, hitting the cap is self-service — the user gets a
  code by email, no admin involved.
- **Sign out everywhere (SY7)** — Web `/settings/security` has a
  "Sign out everywhere" action that calls
  `supabase.auth.admin.signOut(userId, "global")`. Kills every
  active session on every device on the next request; the local
  cookie is dropped immediately so the current tab lands on
  `/login`.
- Web + mobile session lifetimes otherwise follow Supabase defaults
  (1 h access, 30 d refresh, rotation enabled).

## Database hardening (SY7)

- **Statement timeout** — `authenticated` and `anon` roles cap at
  10 s per query (`ALTER ROLE ... SET statement_timeout`).
  `service_role` and the direct Prisma connection are exempt so
  legitimate long jobs (Tally reconciliation, CSV import,
  migrations) still run.
- **FORCE ROW LEVEL SECURITY** — every domain table with
  `ENABLE ROW LEVEL SECURITY` now also has `FORCE ROW LEVEL SECURITY`
  so the table owner (postgres) doesn't bypass its own policies. A
  leaked owner password no longer defeats scope checks.
- **`SET search_path = public`** — every `SECURITY DEFINER`
  function in the repo carries this line. Verified by grep in
  `20260827240000_db_hardening`. A missing search_path on a
  DEFINER function is a documented privilege-escalation path.
- `COMMENT ON FUNCTION` set for `current_user_role`,
  `redeem_enrollment_code`, `consume_recovery_code` — invariants
  a refactor will see in `\df+`.

## Content Security Policy

- `default-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `img-src` allows `https:`
  because we render signed URLs from Supabase Storage.
- `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'` (SY7).
  **No `'unsafe-inline'`.** `middleware.ts` generates a fresh 16-byte
  nonce per request and puts it on the `x-nonce` request header so
  server components can read it via `headers()`. Next.js reads the
  same nonce from the CSP header and stamps its own hydration script.
  `'unsafe-eval'` remains ONLY in dev (React fast-refresh); the
  production build never needs it.
- `report-uri /api/csp-report` + `Reporting-Endpoints: csp-endpoint`.
  Violations are logged (server log line, no persistence) so we
  catch our own regressions when a next/font update or npm dep
  starts emitting an unnonced script.
- `style-src 'self' 'unsafe-inline'` remains — Tailwind emits inline
  style attributes; there is no XSS surface via style alone.

## Site access

The old `SITE_ACCESS_TOKEN` middleware gate (a shared secret in a
30-day cookie with no per-person revocation) was **removed in SY7**.
Deployment-level access control is now handled by **Vercel
deployment protection** (Vercel Auth or password) configured in the
Vercel dashboard. This gives per-person revocation and no shared
secret to rotate. If a preview URL needs to leak beyond the
authenticated team, use Vercel's own password-protection feature —
never re-introduce the shared-cookie pattern.

## Signed URLs

All private-bucket downloads go through short-lived signed URLs.
`SIGNED_URL_EXPIRY_SECONDS = 300` (5 min) in `lib/storage.ts` and in
`mobile/src/lib/uploads.ts`. **A signed URL is never embedded in a push
notification payload** — the notify Edge Function only sends deep-link
URLs of the form `syncit://orders/<id>`, which the app resolves +
re-signs at open time.

Every signed URL now carries `Content-Disposition: attachment` via
Supabase's `createSignedUrl(..., { download: filename })` (SY7).
Even if a byte stream mislabelled as an image slipped past the
hardening pipeline, the browser would download it instead of
executing it in this origin.

## Upload hardening (SY7)

Every upload — web admin action, mobile order document, mobile
payment proof — passes through `lib/uploads/hardening.ts` before
`supabase.storage.upload()`:

- **Magic-byte allowlist** — PDF (`%PDF-`), JPEG (`FF D8 FF`),
  PNG (`89 50 4E 47 0D 0A 1A 0A`). Client-supplied Content-Type is
  ignored; the type is derived from the sniffed bytes. Anything
  else is rejected with a generic "Only PDF, JPEG, and PNG files
  are accepted." (WEBP, HEIC, SVG were dropped from the allowlist
  — sharp's HEIC support is optional per deploy and SVG is a
  scripting surface. Mobile is expected to convert to JPEG before
  upload; every mainstream picker already does.)
- **Server-side size cap** — enforced in `hardenUpload` and in the
  `/api/uploads/document` route's own `content-length` check.
  Buckets keep their own `fileSizeLimit` as a third layer.
- **EXIF stripped** — sharp is invoked with no `withMetadata()` so
  every field including GPS, camera serial, device make/model, and
  timestamp is removed. `.rotate()` bakes orientation into pixels
  first so the image still renders right-side-up.
- **Server-side re-encode** — images are decoded to pixels and
  re-emitted as fresh JPEG (mozjpeg) or PNG. Polyglot files (a
  JPEG with a valid JavaScript trailer) become plain JPEGs on the
  way out because the re-encoded byte stream has no leftover
  trailer to interpret.
- **Mobile uploads travel through the server** — `/api/uploads/document`
  authenticates via bearer + `requireProfileApi`, decodes the
  base64 body, runs the same hardening, then writes with the
  service-role client. The old direct-to-storage RN path is
  gone. Storage RLS still gates web-server uploads.

PDFs are magic-byte-verified but NOT re-encoded — re-rendering
through pdf-lib strips signatures and interactive form fields that
customers legitimately use. The magic check plus attachment
disposition is the mitigation.

## Crawler + scanner defence (SY8)

The app holds customer names, pricing, credit limits, and order
history. **None of it should ever reach a search index or a training
corpus.** Defence sits at four layers so a hole in one still keeps
the data private:

1. **Session gate is the real control.** Every route under
   `(dashboard)` is unreachable without a Supabase session — a
   fact the vitest suite `auth-gate.test.ts` asserts against a
   curated list of paths so no future refactor can silently open
   one up. The one genuine public surface is `/status/[token]`,
   which serves *one* order's status and customer-visible
   documents (`INVOICE`, `LORRY_RECEIPT`) for exactly the id
   embedded in the signed token — no cross-order navigation, no
   party outstanding, no rates.
2. **Robots.txt with named agents.** `app/robots.ts` disallows
   `/` for `*` plus every named AI crawler in the SY8 spec
   (GPTBot, ClaudeBot, anthropic-ai, CCBot, Google-Extended,
   PerplexityBot, Bytespider, Amazonbot, Applebot-Extended,
   meta-externalagent, Diffbot, Omgilibot, ImagesiftBot,
   Timpibot, cohere-ai). Well-behaved crawlers respect it. This
   is a request, not a control.
3. **Per-response header for the ones that don't.** Middleware
   sets `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet,
   noimageindex, noai, noimageai` on every response. `/status/
   [token]` also declares `robots: { index: false, follow: false,
   noarchive, nosnippet, noimageindex }` in its page metadata so
   the HTML-layer signal is present even if the header is
   stripped somewhere upstream.
4. **Cache-Control on every authenticated response.**
   `private, no-store, max-age=0, must-revalidate` — nothing an
   authenticated user sees lands in a shared cache. Static Next
   assets (`/_next/`) are excluded from the matcher so they keep
   their long-lived caches.

### Rate limit at the edge

Middleware runs a best-effort token bucket keyed by IP × coarse
route (`login` or `auth`) — 10 requests per 60 seconds per IP.
Over-limit requests get a 429 with `Retry-After: 60`. This is
in-memory per V8 isolate so a distributed attack can still hit
harder; **the correct defence against distributed abuse is Vercel's
Attack Challenge Mode** (dashboard → Firewall → Attack Challenge).
The in-middleware limiter catches single-source floods without a
paid WAF plan and buys time until Attack Mode kicks in.

### Honeypot

`/api/v1/export-all` is disallowed in `robots.txt` and never
referenced by any legitimate code path. Every GET/POST/PUT/DELETE
here logs a structured `[honeypot]` line with IP, method, path, UA,
and the shape of any `Authorization` header (never the value), then
returns a plain 404 indistinguishable from a missing route. A spike
in `[honeypot]` lines in Vercel logs means someone is walking the
route table.

### Operator checklist — turn on at deploy

Some SY8 protections live in the Vercel dashboard, not this repo:

- **Vercel Attack Challenge Mode** — Project → Settings → Firewall
  → toggle on. Use during pilots or after a public URL leak.
- **Vercel deployment protection** — Project → Settings →
  Deployment Protection → Vercel Auth (or password). Replaces the
  removed `SITE_ACCESS_TOKEN` gate (see "Site access" above).
- **Access logs → SIEM / log-drain** — hitting `/api/v1/export-all`,
  a 429 spike on `/login`, or CSP report volume are all signals a
  human should see. Point Vercel logs at whatever your team reads.

## When someone leaves the company

The moment access is revoked:

1. Sign in to the web console as any active ADMIN.
2. Go to **Admin → Users**, find the row, click **Deactivate**. Confirm
   the person by name in the dialog.

That single click, atomically:

- Sets `Profile.isActive = false` (RLS locks them out via
  `current_user_role()` returning NULL for every subsequent query).
- Trigger `_profile_after_deactivate` DELETEs every `PushToken` for
  that profile — no more push notifications will reach any of their
  devices.
- Writes a `UserAuditLog` row (`action = DEACTIVATED`,
  `actorId = <you>`).
- Their mobile app, when it next opens, reads the flipped `isActive`,
  signs out, and routes to `/account-disabled` with a "contact your
  admin" screen.

You do **not** delete the row. Deactivation is reversible; deletion
would cascade into every SalesOrder, OrderStatusEvent, OrderComment,
DispatchLot, and Payment they touched — losing months of audit trail.
Data is never deleted for user-departure purposes.

If the user held ADMIN and was the *last* active ADMIN, promote
someone else first — both the server action and
`_profile_guard_last_admin` trigger will refuse the deactivate
otherwise, with `Refusing to leave the system without an active ADMIN`.

## Reporting an issue

Send it to the current active ADMINs (see `/admin/users`) — the
directors of the distributor account. Do not open a public GitHub
issue. Anything credential-shaped (tokens, keys, session cookies)
should be assumed compromised and rotated:

- Rotate `NOTIFY_SHARED_SECRET`:
  `supabase secrets set NOTIFY_SHARED_SECRET=$(openssl rand -hex 32)`
  then `UPDATE "NotificationConfig" SET "edgeFunctionSecret" = '<same>' WHERE id='singleton';`
- Rotate `TALLY_SYNC_SECRET` / `CRON_SECRET` by updating the deployment
  environment and rolling the deploy — old bearer tokens stop working
  the moment the env is read.
- Rotate `WHATSAPP_APP_SECRET` in the Meta app dashboard and update
  the env; the POST handler fails closed until the value matches.
