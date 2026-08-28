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

## Other operational settings

_(to fill in as they matter — for now, the sessions story is what
was most-often refactored the wrong way)_
