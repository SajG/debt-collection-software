# Company onboarding, staff invites and lead capture — design

Date: 2026-10-14 · Status: approved by owner in chat, building

## Goal

A manager lands on the website, creates their company with a password (or
Google), and invites staff by email. Each invitee gets a link, chooses a
password, and joins that company with the role the manager picked. Every
sign-up stores enough detail and source information for Syncit to follow up.

## Findings that drive the design

- Web sign-in/sign-up is emailed 6-digit code or Google only. Password was
  removed in SY31 because no set/reset path existed. We add both.
- Staff are created immediately (Profile + Membership + auth user with a
  **required phone**) and sent a Supabase invite whose template is hardcoded
  to "Synergy Bonding Solutions". No pending/accepted/expired state.
- Self-serve signup is behind `SIGNUP_ENABLED` (default off).
- An email/phone already in another company is rejected, so one person
  cannot belong to two companies even though Membership supports it.
- Mobile is sign-in only (App Store 3.1.1) — accounts come from web.

## Scope

1. **Lead capture** at sign-up (new `SignupLead`, extra Organization columns).
2. **Password auth** on web: sign-up, sign-in, verify email, forgot/reset.
   Google stays. Emailed code stays as a secondary "email me a code" link
   so existing staff are never locked out.
3. **Invitations**: `Invitation` table, branded email, `/join/[token]`
   accept page, pending/resend/revoke in Team, seats counted on accept.
4. **Existing users join a second company** via invite.
5. **Mobile**: password sign-in option; clearer "no invite found" copy.

Out of scope (follow-ups): phone-OTP verification of mobile, universal
links/deep link into the app, GSTIN auto-fill from a paid API, CRM export.

## Lead capture

### Asked on the form

| Field | Required | Notes |
|---|---|---|
| Your name | yes | |
| Work email | yes | verified via link |
| Mobile (10-digit) | yes | stored `+91…`, unverified in v1 |
| Company name | yes | |
| GSTIN | no | validated by format + checksum when given; "no GST yet" is fine |
| City, State | yes | state from list |
| Address, Pincode | no | |
| Industry | yes | existing list |
| Team size | no | 1–5 / 6–20 / 21–50 / 50+ |
| Password | yes (not for Google) | min 10 chars |

### Captured automatically (first touch, cookie `syncit_attr`, 90 days)

`utm_source/medium/campaign/term/content`, `gclid/fbclid`, `referrer`,
landing path, referral code (`/r/<code>`), IP, user-agent, signup time,
auth method (`password` | `google`).

### Storage

- `SignupLead` — one row per sign-up attempt/completion: every field above,
  `status` (`PENDING_VERIFY` → `COMPLETED`), `profileId`, `organizationId`.
  Survives even if the org is later deleted (no FK cascade) so sales can
  follow up. Platform-owner-only (no tenant RLS exposure).
- `Organization` gets `address`, `pincode`, `teamSize`, `signupSource`
  (denormalised utm_source/referrer for the platform console).
- `Profile.phone`/`email` stay the identity anchors.

## Auth

### Sign-up (password)

1. Form → `signUpWithPasswordAction`: validate, rate limit (existing
   SignupAttempt), `auth.signUp({ email, password, emailRedirectTo })`,
   write `SignupLead(PENDING_VERIFY)` keyed by auth user id.
2. User clicks Supabase confirmation link → `/auth/callback`.
3. Callback sees user with no Membership and a pending lead →
   `provisionCompany` from the lead → pin `active_org_id` → `/onboarding`.
4. Existing email: respond identically ("check your email") — no
   enumeration oracle.

### Sign-up (Google)

Callback → no Membership and no lead → `/signup/complete` collects the same
company fields (name/email prefilled) → provision → `/onboarding`.

### Sign-in

`/login`: email + password, Continue with Google, "Forgot password?",
"Email me a code instead". Existing rate limits and the MFA/aal2 routing in
`verifyEmailCodeAction` are factored into one shared `finishSignIn()` so
password and code paths route identically (role home, `requireManagement2fa`,
disabled accounts, no-membership → onboarding).

### Forgot / reset

`resetPasswordForEmail` → `/auth/callback?next=/reset-password` →
set-new-password form. Always responds "if registered, email sent".

### Supabase settings (dashboard, not code)

Email+password provider ON, "Confirm email" ON, leaked-password protection
ON, min length 10. Documented in `docs/LOGIN-RUNBOOK.md`.

## Invitations

```
Invitation(id, organizationId, email, role, ownerName?, phone?,
           tokenHash, status PENDING|ACCEPTED|REVOKED|EXPIRED,
           invitedById, expiresAt (7d), lastSentAt, sendCount,
           acceptedAt, acceptedProfileId, createdAt)
```
Partial unique index: one PENDING invite per (organizationId, email).
Only the SHA-256 of the token is stored; plaintext exists only in the email.

### Invite

`inviteMemberAction({ email, role, ownerName?, phone? })` — ADMIN only,
tenant-scoped. Phone optional. Rejects if the email already has an active
membership **in this company**; allowed if they belong to another company.
Sends our own Resend email: company name, role, inviter, expiry, CTA to
`/join/<token>`. Seats are checked at invite and again at accept; pending
invites do not consume a seat.

### Accept — `/join/[token]`

- Invalid/expired/revoked → clear message + "ask your manager to resend".
- Signed in as the invited email → "Join <Company> as <Role>" → creates
  Membership, pins org, role home.
- Not signed in, no account → set name + password (or Google if same
  email) → create auth user with `email_confirm: true` (the emailed token is
  proof of mailbox ownership), Profile, Membership; mark ACCEPTED; sign in.
- Account exists → sign in first, then join.

### Manage — Team page

Pending / Expired list with Resend (5-min throttle, as today) and Revoke.
Wizard team step switches to invitations.

## Mobile

- Email screen gains a password field + "Use a code instead".
- Copy: "No invite? Ask your manager to invite {email}".
- Invited staff finish on the web `/join` page (works in a phone browser),
  then sign in on the app. Deep link is a follow-up.

## Security

- Passwords never touch our DB; Supabase Auth hashes them.
- Invite tokens: 32 random bytes, hash at rest, single use, 7-day expiry.
- All writes tenant-scoped via `tenantDb`; SignupLead is service-role only.
- Rate limits: signup per IP/domain (existing), password login per email
  (existing `checkLoginRateLimit`), invite sends per org per hour.
- Uniform responses for existing/unknown emails.
- Migrations are written but **not applied** to production by this work.

## Testing

Pure-function unit tests (GSTIN checksum, attribution parsing, token
hash/expiry). No test in this work touches the live database; server
actions are verified by typecheck, lint and manual flow once the migration
is applied to a non-prod database.
