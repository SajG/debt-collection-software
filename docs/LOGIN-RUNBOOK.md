# Mobile login runbook

Diagnose "I can't log in" in 60 seconds. The chain has seven links;
each one has a specific way of breaking and a specific symptom the
user sees.

## The chain

```
1. mobile/app/(auth)/email.tsx           (user types email)
        │
        ▼
2. supabase.auth.signInWithOtp({
     email, options: { shouldCreateUser: false }
   })                                    (allowlist check)
        │
        ▼
3. Supabase → email provider → user's inbox
   template supabase/templates/magic-link.html renders {{ .Token }}
        │
        ▼
4. mobile/app/(auth)/code.tsx  →  supabase.auth.verifyOtp({
     email, token, type: 'email'
   })                                    (issues the JWT)
        │
        ▼
5. supabase.rpc("register_device", { p_device })
   Inserts a Device row for auth.uid(), revokes any prior device.
        │
        ▼
6. AuthContext.loadProfile(auth.uid())
   Profile lookup by id. Stamps firstSignInAt on first hit.
        │
        ▼
7. app/index.tsx root gate  →  /(factory) | /(staff) | /(admin)
```

## First triage step, always

Ask the user which of these three they see:

- **"We couldn't send a code."** (link 2 failed)
- **"That code didn't work."** (link 4 failed)
- App gets past both, then bounces to /(auth)/email again. (link 5,
  6, or 7 failed silently)

Then walk down the chain from there.

## Link-by-link

### 1. `mobile/app/(auth)/email.tsx`

The user types their email. Client-side validation checks it's a
plausible address (`someone@domain.tld`). No allowlist check
happens here — that's link 2.

**Symptoms + fixes**

| Symptom | Cause | Fix |
|---|---|---|
| Nothing happens on tap | JS crash — `expo start --clear` output usually has the trace. | Check the Metro terminal. |
| "Enter a valid email address." | Client regex rejected the string. | Space, missing @, missing TLD. Look at what they typed. |

### 2. `signInWithOtp({ email, options: { shouldCreateUser: false } })`

`shouldCreateUser: false` is the allowlist. Supabase silently
returns success **without sending mail** if there is no auth user
with that email. Which means from the mobile app's perspective,
"admin never added me" and "code sent" look identical — that is the
whole point (no oracle for whether an email is known).

**Symptoms + fixes**

| Symptom | Cause | Fix |
|---|---|---|
| "We couldn't send a code." + `[dev]` says Supabase HTTP error | Supabase project misconfigured — see link 3. | Dashboard → Authentication → Providers → Email → check enabled + SMTP configured. |
| No email arrives but no client error | The admin never added this user, OR the address they typed is one character off, OR SMTP is on Supabase's dev sender and it's rate-limited. | Confirm in `/admin/users` that the exact email is on file. Retry with a fresh code. |
| "Too many code requests" | Cap 3 per email per 15 min (`checkEmailOtpSendLimit`) or IP burst (middleware). | Wait 15 min. |

### 3. Supabase → email provider → user's inbox

The template lives at `supabase/templates/magic-link.html`. It renders
`{{ .Token }}` as large monospace text — not a link. Reasoning is in
the template header (Android Gmail WebView deep-link problem).

**Symptoms + fixes**

| Symptom | Cause | Fix |
|---|---|---|
| Email never arrives | SMTP misconfigured, or on Supabase's shared sender (rate-limited + spam-filtered). | Dashboard → Authentication → SMTP Settings → set Resend/Postmark/SES with SPF + DKIM. |
| Email arrives after 5+ minutes | Provider queue delay OR the OTP had already expired by delivery. | Set Authentication → Providers → Email → **Email OTP Expiration = 600 s** (10 min). |
| Email lands in spam | Missing SPF / DKIM on the sending domain. | Add them at your DNS. This is the single most likely thing to go wrong on launch day. |
| Email arrives but has no code, only a link | Wrong template. Someone pasted a `{{ .ConfirmationURL }}` version. | Re-paste `supabase/templates/magic-link.html` — the version that uses `{{ .Token }}`. See docs/EMAIL-TEMPLATES.md. |

### 4. `verifyOtp({ email, token, type: 'email' })`

**Symptoms + fixes**

| Symptom | Cause | Fix |
|---|---|---|
| "That code didn't work." + `[dev]` says "Token has expired" | 10-min window ran out. | Tap "Resend code". |
| "That code didn't work." + `[dev]` says "Invalid token" | Typo, or the user is using an older code (a fresh Send Code invalidates the old one). | Latest code only. |
| Nothing responds | Network dead. | Check connectivity chip on the home screen. |

### 5. `register_device` RPC

Authenticated-only. Inserts a Device row + revokes any prior
un-revoked Device for this profile. Runs as `auth.uid()`.

**Symptoms + fixes**

| Symptom | Cause | Fix |
|---|---|---|
| Signed in but immediately signed out | `current_user_role()` returned NULL → profile deactivated. See link 6. | Re-activate in `/admin/users`. |
| "Not authenticated" | Session token was rejected on the way to the RPC. Rare — usually a clock skew or the auth cookie didn't propagate. | Force-close the app and retry. |

### 6. `AuthContext.loadProfile(auth.uid())`

Profile lookup **by id, NOT by email**. This is deliberate — if a
Profile row is missing, deactivated, or has an unknown role, the
session is torn down defensively so no screen renders with an
ambiguous identity. Also stamps `firstSignInAt` on the first
successful load (RLS allows own-row UPDATE).

**Symptoms + fixes**

| Symptom | Cause | Fix |
|---|---|---|
| Signed out immediately with no screen change | Profile row missing for this auth.users id. Rare — usually a hand-created auth user without the matching Profile insert. | Delete the orphan auth user in Supabase → recreate via `/admin/users`. |
| Bounces to `/account-disabled` | `Profile.isActive = false`. | Re-activate in `/admin/users`. |
| Bounces to `/unsupported-role` | `Profile.role` is not one of ADMIN / STAFF / FACTORY. | Fix the row via SQL editor or admin/users. |

### 7. Root gate — `app/index.tsx`

```
FACTORY  → /(factory)
STAFF    → /(staff)
ADMIN    → /(admin)
locked   → /unlock          (device lock evaluates first)
```

**Symptoms + fixes**

| Symptom | Cause | Fix |
|---|---|---|
| Prompts for biometric/PIN | Cold start OR >5 min backgrounded — device lock, not a re-auth. | This is expected. Complete the prompt. |
| Prompts for PIN and rejects the right one | 5 wrong attempts wiped the lock. User must sign in fresh via email. | Sign out, sign in again with email OTP, set a new PIN. |
| Signed in fine but on the wrong home screen | Wrong role in Profile. | Change role in `/admin/users`. |

## Common failures under SY-email

| Symptom | Cause | Fix |
|---|---|---|
| First-time sign-in works, next open bounces to /(auth)/email | Absolute 90-day cap fired — but it shouldn't on day two. Check `syncit:authenticatedSince` in SecureStore for the phone's actual clock. | Real cause is usually clock drift. Fix the phone's date/time. |
| "Too many attempts on this factor" | 5-fail/15-min freeze OR the 3-send/15-min cap. Different messages, different scopes — read the exact text. | Wait 15 min. |
| Signed in yesterday, today can't unlock | Local lock wiped (5 wrong PIN attempts) OR absolute-90d cap OR admin revoked device. | Sign in fresh via email. |
| Two phones, second one signed the first one off | One active device per user — `register_device` revokes the prior device row. Documented invariant. | User picks which phone. |

## Revoking a lost/stolen device

Admin → `/admin/devices` → row → **Revoke**. Type the owner's name to
confirm. Server calls `revoke_device` RPC (sets `revokedAt`) + admin
`signOut(userId, "global")` so any live JWT dies on next request.
Because SY-email is one-active-device-per-user, this also boots any
other active session that user had — they re-enrol via email OTP.

## Historical chains

**SMS-OTP** (removed 2026-08-27, SY0) — phone + 6-digit SMS.
Backdoor code `123456` was live in every build; see SECURITY.md
"Known past exposure". Replaced by device-enrollment codes.

**Device enrollment codes** (removed 2026-08-28, SY-email) — admin
issued an 8-char code from `/admin/users`; user typed phone +
code on mobile. Required admin action per device, high support
burden. Backed by `redeem_and_mint_session`, an anon-callable RPC
that wrote directly to `auth.users.encrypted_password` — see
SECURITY.md for the exposure record. Replaced by the current
email-OTP flow above.
