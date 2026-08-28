# Mobile login runbook

**SY1 status (2026-08-27):** SMS-OTP is retired. Sign-in is admin-issued
enrollment codes + biometric/PIN unlock. The historical SMS chain is
preserved further down as reference.

## The current chain (SY1)

```
1. Admin opens /admin/users → "Issue code" for the target person.
   Server action → RPC issue_enrollment_code(profile_id).
   Returns an 8-char code shown once, expires in 30 minutes.
        │
        ▼
2. User opens PayTrack → mobile/app/(auth)/enroll.tsx
   Types their 10-digit phone + the code.
        │
        ▼
3. Client POSTs /api/auth/enroll { phone, code, device }.
   Server route calls RPC redeem_enrollment_code — does rate-limit
   (reuses check_phone_otp_rate_limit), hash compare, expiry /
   consumption / phone-match / profile.isActive checks, revokes any
   prior un-revoked Device for this profile, inserts a fresh Device
   row, marks the code consumed, writes UserAuditLog.
        │
        ▼
4. Server calls admin.updateUserById to attach the synthetic email
   <profileId>@device.paytrack.local (idempotent, undeliverable),
   then admin.signOut(userId, "global") so any surviving JWT from
   the revoked-in-step-3 device dies, then admin.generateLink
   ({ type: "magiclink", email }). Returns hashed_token to client.
        │
        ▼
5. Client calls supabase.auth.verifyOtp({ email, token, type:
   "magiclink" }) → session created + persisted in SecureStore.
        │
        ▼
6. First-run only: /set-up-lock — user picks biometric or 6-digit PIN.
   PIN stored as salted SHA-256 in SecureStore; biometric held by OS.
        │
        ▼
7. Every cold start / >5-min background resume: /unlock — biometric
   or PIN. AuthContext.markUnlocked() flips `locked`, root gate
   re-routes.
        │
        ▼
8. app/index.tsx → /(admin) | /(factory) | /(staff) by role.
```

## Common SY1 failures

| Symptom | Cause | Fix |
|---|---|---|
| "Enrollment failed" | Wrong code / expired / used / phone mismatch / profile deactivated. Wire message is generic — real reason in Postgres logs. | Admin issues a new code. |
| "Too many wrong attempts" | 5-fail/15-min freeze on that phone. | Wait 15 min. |
| Signed in yesterday, today can't unlock | 7-day idle timeout wiped local session. | Re-enrol (new code). |
| Biometric doesn't prompt | `isBiometricAvailable()` = false — no biometric enrolled on the OS. | Set one up in phone Settings, or sign out and pick PIN. |
| PIN wiped after 5 wrong tries | `MAX_PIN_ATTEMPTS` reached — AuthContext force-signed-out. | Admin issues a new code. |
| Second phone kicked the first off | One-active-device-per-user (documented in migration 20260827180000_device_enrollment). | User picks which phone. |

## Revoking a lost/stolen device

Admin → /admin/devices → the row → Revoke. Type the owner's name to
confirm. Server calls `revoke_device` RPC (sets `revokedAt`) + admin
`signOut(userId, "global")` so any live JWT dies on next request.
Because SY1 is one-active-device-per-user, this also boots any other
active session the user had — re-enrol as needed.

## Historical SMS-OTP chain (removed 2026-08-27)

```
1. mobile/app/(auth)/phone.tsx        (user types 10-digit number)
        │
        ▼
2. supabase.rpc("check_phone_otp_rate_limit", { p_phone: +91… })
        │
        ▼
3. supabase.rpc("is_provisioned_phone", { p_phone: +91… })
        │
        ▼
4. supabase.auth.signInWithOtp({ phone: +91… })   (SMS is sent)
        │
        ▼
5. mobile/app/(auth)/verify.tsx  →  supabase.auth.verifyOtp(...)
        │
        ▼
6. AuthContext.loadProfile(auth.uid())
        │   Profile lookup is BY id, NOT by phone.
        ▼
7. app/index.tsx root gate  →  /(factory) | /(staff) | /unsupported-role
```

## First triage step, always

Run:

```bash
npm run verify:team
```

It reports one row per person in `prisma/team.ts` with a status column. Any row whose status is not `OK` is the answer. If verify passes and the user still can't log in, the fault is in the phone screen, the SMS provider, or the device.

For a full-fat debug on the phone screen itself, run a **dev build** — with `__DEV__` true, the generic "This number is not registered" error is suffixed with the real reason (`unprovisioned` / `rate_limited` / `rpc_error: <message>`). Release builds show only the generic message.

## Link-by-link

### 1. `phone.tsx` — client validates + calls the gate

**What can break:** the number the user typed isn't a valid 10-digit Indian mobile (`^[6-9]\d{9}$`), or the whole gate chain below fails.

**Symptom to the user:**
- Invalid number → "Enter a valid 10-digit mobile number." (i18n `auth.phone.invalid`)
- Anything else in the gate → the single generic string: **"This number is not registered. Contact your administrator."**

**Debug:** in a dev build the error line has a second line `[dev] unprovisioned` / `[dev] rate_limited` / `[dev] rpc_error: …`. Use that to jump straight to the failing link.

### 2. `check_phone_otp_rate_limit` — per-phone SMS rate limit

**What can break:** the user (or someone with the same phone) already asked for too many codes in the window. The RPC returns `{ limited: true, retryAfterMinutes }`.

**Symptom:** generic error. Dev-build suffix: `[dev] rate_limited`.

**Fix:** wait it out, or delete rows from `LoginAttempt` for that phone in the Supabase SQL editor.

### 3. `is_provisioned_phone` — allowlist gate

**What can break:**
- **Not in the allowlist.** `Profile.phone` matches neither `+91XXXXXXXXXX` nor bare 10-digit for that number. Cause: the team seed didn't run, or the row was hand-created with the wrong phone format.
- **RPC error.** DB down, function missing, permissions revoked. Errors are swallowed by design so the client can't distinguish "unknown number" from "network down".

**Symptom:** generic error. Dev-build suffix: `[dev] unprovisioned` or `[dev] rpc_error: <message>`.

**Fix:** `npm run verify:team` will show `NO_PROFILE` for anyone missing. Run `npm run db:seed` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set. If those env vars are missing, the seed prints a loud warning block and creates zero users.

### 4. `supabase.auth.signInWithOtp` — actually send the SMS

**What can break:** SMS provider (Twilio/MSG91/etc) is misconfigured, out of credit, or the number is on their block list.

**Symptom:** in a dev build, the provider's error message is shown inline. In release, the generic string. The user never receives an SMS.

**Fix:** Supabase dashboard → Auth → Providers → Phone. Check the provider's own logs.

### 5. `verify.tsx` → `supabase.auth.verifyOtp`

**What can break:** wrong code, expired code, or (rare) the auth user was deleted between step 4 and step 5.

**Symptom:** "Invalid code" or similar, shown on the verify screen. The user stays on the verify screen.

### 6. `AuthContext.loadProfile(auth.uid())` — **most common silent break**

The lookup is by `id`, **not** by phone:

```ts
supabase.from("Profile").select("*").eq("id", userId).maybeSingle();
```

**What can break:**

- **`Profile.id` != `auth.users.id`.** Someone created the profile row by hand (or ran the seed against a different auth user than the one that now exists). The provisioning gate passes (it matches by phone), the OTP is delivered, `verifyOtp` succeeds — and then `loadProfile` finds nothing and calls `supabase.auth.signOut()`. The user is dumped back to the phone screen with **no error message at all**. **This is the "OTP worked and then nothing happened" bug.** `verify-team.ts` reports this as `ID_MISMATCH`.

- **No Profile row at all.** Same code path, same symptom. `verify-team.ts` reports `NO_PROFILE`.

- **`Profile.isActive = false`.** The user is routed to `/account-disabled` and then signed out. They see the disabled screen with the explanation.

- **`Profile.role` is not one of `ADMIN` / `STAFF` / `FACTORY`.** Signed out defensively; user bounces back to the phone screen.

**Fix for ID_MISMATCH specifically:** delete the offending `Profile` row, then re-run `npm run db:seed`. The seed creates the auth user first and uses its id as `Profile.id`, guaranteeing they match.

### 7. Root gate — `app/index.tsx`

**What can break:** role isn't `ADMIN`/`STAFF`/`FACTORY`.

**Symptom:**
- `!session` → `/(auth)/phone` (expected on cold start)
- `!profile` → `/no-profile`
- role `FACTORY` → `/(factory)`
- role `ADMIN` / `STAFF` → `/(staff)`
- other → `/unsupported-role`

## The Chaitanya case specifically

Chaitanya Deshpande, FACTORY, `8626010898`. Expected end state after seed:

- `auth.users` row: `phone = '+918626010898'`, `phone_confirmed_at` non-null.
- `Profile` row: same `id` as above, `phone = '+918626010898'`, `role = 'FACTORY'`, `isActive = true`.

Run `npm run verify:team` and look at the row for his phone. Statuses in decreasing order of "you're about to have a bad day":

| Status | Meaning |
| --- | --- |
| `OK` | login should work; look at the SMS provider or the device |
| `NO_PROFILE` | seed never ran — `npm run db:seed` |
| `NO_AUTH` | Profile exists without an auth user — delete the Profile row, re-seed |
| `ID_MISMATCH` | **the silent OTP-worked-then-nothing bug** — delete the Profile row, re-seed |
| `PHONE_NOT_CONFIRMED` | auth user exists but never confirmed — delete the auth user, re-seed |
| `INACTIVE` | `Profile.isActive = false` → `/account-disabled` — reactivate in admin |
| `ROLE_MISMATCH` | wrong role in DB vs roster — update the Profile row |
