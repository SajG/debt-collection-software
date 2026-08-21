# SynWorks — mobile app

React Native (Expo, TypeScript) companion app for adhesives-industry
salespeople. Talks to the same Supabase project as the SynWorks web app;
row-level security scopes each user to their own orders.

## Design principles (enforced across every screen)

- Minimum tap target 56 px (`theme.tap`).
- Body text ≥ 16 px, high contrast (`theme.type.body` = 18).
- Two taps max from home to any action.
- Native `Alert` confirmations for destructive / final actions.
- All copy through `t()` so Hindi / Marathi can be added later without touching screens.

## First-time setup

```bash
cd mobile
npm install
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

# generate placeholder icon/splash PNGs (only if missing / for a fresh clone)
npm run assets:placeholder

# start Expo Go dev server
npm start
```

## Supabase side (one-time)

1. **Apply the RLS migration** from the main repo: `npm run db:rls` (in the root project). Without it, mobile users can read anyone's rows.
2. **Regenerate DB types** after **every** migration that touches
   `public.*` (tables, columns, RPCs, enums). The mobile app is
   type-checked against `src/lib/database.types.ts`; if it goes stale
   you lose the safety net and inserts can crash on device.
   ```bash
   export SUPABASE_ACCESS_TOKEN=sbp_your_personal_access_token
   npm run types:generate
   ```
   Then run `npm run typecheck` from `mobile/` and fix any resulting
   errors *properly* — do not reach for `as any` to make them go
   away. The GitHub Actions `typecheck` workflow (see
   `.github/workflows/typecheck.yml`) blocks merges that regress.

   The file has a small hand-maintained tail (legacy enum aliases +
   two RPC arg widenings — supabase gen types doesn't infer `DEFAULT
   NULL` on function params). Keep those in place when you regenerate;
   the block is fenced by a `// Legacy hand-authored aliases` comment.

## Phone OTP auth (required before rollout)

The mobile app authenticates every user via a real Supabase phone OTP.
There is no code-level bypass — a device with no session is redirected
straight to `/(auth)/phone`. Configure the following in this order:

1. **Authentication → Providers → Phone → enable.**
2. **SMS provider.** Wire Twilio / MessageBird / Vonage credentials
   under the same Phone provider settings. Without a provider, sends
   fail and users cannot log in.
3. **Phone confirmations: ON.** Codes are accepted only after real SMS
   delivery.
4. **Provision Profile rows.** Every phone that should be able to log
   in needs a matching `Profile` row (`id` = the Supabase user id
   Supabase issues on first sign-in). Set `role` to `ADMIN`, `STAFF`,
   or `FACTORY`. `AuthContext` signs the user out on any other value
   or a missing row.
5. **Apply migration `20260819180000_login_attempt_phone_rate_limit`**
   so `check_phone_otp_rate_limit` / `record_phone_otp_attempt` exist.
   The mobile app calls them anonymously to throttle brute-force
   verify attempts (5 fails / 15 min blocks the phone).

### OTP allowlist — server-side enforcement

The mobile phone screen calls `is_provisioned_phone(p_phone)` (Postgres
RPC, `SECURITY DEFINER`, granted to `anon`) **before** `signInWithOtp`.
An unknown number never costs an SMS.

The RPC is deliberately a phone-number oracle, so:

- Every call is passed through the existing
  `check_phone_otp_rate_limit(p_phone)` first (5 fails / 15 min blocks
  further attempts).
- Unprovisioned / rate-limited / RPC-error all show the SAME generic
  message — "This number is not registered. Contact your administrator."

**The client-side check is a cost control, not a security boundary.**
Anyone with a fresh install could bypass it and still hit
`signInWithOtp` directly. Close that with Supabase's own settings:

- Supabase dashboard → **Authentication → Providers → Phone**:
  - Turn **Phone confirmations** ON.
  - Under the SMS provider (Twilio / MessageBird / etc.), configure a
    per-number allowlist if the provider supports one. Twilio has
    per-number geographic permissions + a "Verified Caller IDs" list
    for trial accounts.
- Supabase dashboard → **Authentication → Auth Settings**:
  - Turn **Enable phone signups** OFF once the initial user list is
    seeded. Together with the RPC gate, this means new phones cannot
    self-provision even if the client is bypassed.
- Every mobile session also runs through `AuthContext`, which signs
  the user out when either the Profile is missing or `isActive` is
  false — so even a JWT minted for an unprovisioned phone lasts
  fractions of a second before being torn down.

### Testing without a real SMS provider

The simplest way to log in during dev without paying for SMS is
Supabase's built-in **Test OTPs** — no code changes required:

- **Authentication → Providers → Phone → Test OTPs**
- Add: phone `+91XXXXXXXXXX`, OTP `123456` (or any 6-digit code)
- Save.

That phone number now bypasses the SMS provider entirely; the code
goes straight through `verifyOtp`. Use it for the boss's demo account,
factory test users, etc. Remove the test rows before rollout.

If you need a totally OTP-free dev login (e.g. for automated tests),
create a Supabase email/password user via the dashboard and set:

```
EXPO_PUBLIC_DEV_TEST_EMAIL=you@example.com
EXPO_PUBLIC_DEV_TEST_PASSWORD=…
```

in `mobile/.env`. A dashed "Dev build" panel with a "Sign in as …"
button then appears on the phone screen **only when `__DEV__` is true
and both env vars are set** — release builds never render it.

## Building an APK

Cloud (EAS):

```bash
npx eas login
npx eas build:configure   # first time only
npx eas build --platform android --profile preview
```

Local (needs Android SDK + JDK 17):

```bash
npx expo prebuild --clean
cd android && ./gradlew assembleRelease
# APK lands in android/app/build/outputs/apk/release/
```

`eas.json` is preconfigured to output APKs on every profile (not AABs)
so field-tester installs are one-tap.

## Push notifications

The mobile app registers an Expo push token after sign-in
(`src/lib/notifications.ts`) and upserts it into the `PushToken` table
(RLS scoped to the signed-in user). Server-side, Postgres triggers on
`OrderStatusEvent`, `OrderDocument`, and `SalesOrder` POST via `pg_net`
to a Supabase Edge Function (`supabase/functions/notify`), which sends
to Expo's push service and cleans up any `DeviceNotRegistered` rows.

Per-user prefs live on `Profile` (`notifyStatusChanges`,
`notifyDocuments`, `notifyStaleOrders`, `notifyCreditIssues`) — all
default ON, toggleable from `/settings` in the app. Global config lives
in the singleton `NotificationConfig` row (`staleOrderHours`,
`edgeFunctionUrl`, `edgeFunctionSecret`).

### One-time deploy

1. **Enable extensions** (already done for the current project — leave
   this here for fresh clones): Supabase dashboard → Database →
   Extensions → toggle `pg_net` and `pg_cron`. The trigger migration
   also runs `CREATE EXTENSION IF NOT EXISTS` for both, so a dashboard
   toggle is only needed if the DB role lacks permission.
2. **Deploy the edge function**:
   ```bash
   npx supabase functions deploy notify --no-verify-jwt
   npx supabase secrets set NOTIFY_SHARED_SECRET=$(openssl rand -hex 32)
   ```
   `--no-verify-jwt` is intentional: the function is called by Postgres
   triggers, not by users. Authentication is done via the
   `x-notify-secret` header instead.
3. **Point the DB at the deployed function** (once):
   ```sql
   UPDATE "NotificationConfig" SET
     "edgeFunctionUrl"    = 'https://<project-ref>.supabase.co/functions/v1/notify',
     "edgeFunctionSecret" = '<same random hex from step 2>'
   WHERE id = 'singleton';
   ```
   Until this UPDATE runs, the triggers silently no-op — so a fresh DB
   never errors on inserts before the function is up.
4. **Tune the stale-order threshold** (defaults to 24 hours):
   ```sql
   UPDATE "NotificationConfig" SET "staleOrderHours" = 12 WHERE id = 'singleton';
   ```
5. **EAS builds** need `projectId` for `getExpoPushTokenAsync`. Run
   `npx eas init` once so `expoConfig.extra.eas.projectId` is populated
   in `app.json`. Without it, dev builds log a warning and skip push
   registration — everything else keeps working.

## Roles

Single login screen for everyone; role decides the destination.

- **STAFF** — routed to `/(staff)`. Own orders only (RLS enforces this
  even if the client tries to peek); can create new orders, record
  payments, view dues + stock, attach ORDER_PROOF / OTHER documents.
- **FACTORY** — routed to `/(factory)`. Sees every salesperson's
  orders; can advance status (ORDER_PLACED → IN_PRODUCTION →
  READY_TO_DISPATCH → LR_GENERATED → DISPATCHED) and attach
  INVOICE / LORRY_RECEIPT / OTHER photos. No FAB, no dues, no
  payments.
- **ADMIN** — routed to `/(staff)`; the home screen exposes a "mine /
  all" scope toggle that STAFF doesn't see.
- **Any other role** — AuthContext signs the user out on load.

## Adding a language

1. Add a new key (e.g. `"hi"`) to `dictionaries` in `src/lib/i18n.ts`, cloning the full `en` shape.
2. Translate value by value; missing keys automatically fall back to English.
3. Wire a language switcher via `setLanguage("hi")`. (Reactive re-render on language change is a follow-up — today the language is read at each `t()` call, so a small context+state upgrade there is enough.)
