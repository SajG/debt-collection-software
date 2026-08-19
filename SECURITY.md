# SECURITY

Small, closed-user-base trust model. This is what stops a single lost
phone or a single compromised session from turning into a data
incident, and what to do when it happens.

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

## Sessions

- Mobile keeps a `paytrack:lastActiveAt` timestamp in AsyncStorage. On
  cold start, if the device has been idle for more than **30 days**,
  `AuthContext` signs the user out and routes to `/(auth)/phone`.
  Independent of Supabase's own refresh-token TTL.
- Web sessions follow Supabase defaults (1 h access token, 30 d
  refresh token). Middleware re-validates on every request and
  redirects unauthenticated traffic to `/login`.
- All OTP verifies are recorded to `LoginAttempt` (success + failure)
  via `record_phone_otp_attempt`. Five failures in 15 minutes on the
  same phone freezes further verifies for that phone.

## Content Security Policy

- `default-src 'self'`; `frame-ancestors 'none'`; `img-src` allows
  `https:` because we render signed URLs from Supabase Storage.
- `script-src` includes `'unsafe-inline'` (Next.js App Router still
  emits an inline hydration script). `'unsafe-eval'` is stripped in
  production (`NODE_ENV === 'production'`); dev builds keep it for
  React fast-refresh.
- Follow-up: move to per-request nonce + `strict-dynamic` once the
  `_document`-shim is wired.

## Signed URLs

All private-bucket downloads go through short-lived signed URLs.
`SIGNED_URL_EXPIRY_SECONDS = 300` (5 min) in `lib/storage.ts` and in
`mobile/src/lib/uploads.ts`. **A signed URL is never embedded in a push
notification payload** — the notify Edge Function only sends deep-link
URLs of the form `paytrack://orders/<id>`, which the app resolves +
re-signs at open time.

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
