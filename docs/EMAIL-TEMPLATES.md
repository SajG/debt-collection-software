# Email templates

Supabase sends four transactional emails: **Invite user**, **Confirm
signup**, **Magic Link**, and **Reset Password**. Templates are
edited in the dashboard and there is no repo-side deploy — so we
keep the canonical HTML in `supabase/templates/` and manually paste.
Any change to a template should land in this repo first, then in the
dashboard, so the two never drift.

## Invite user

**Source of truth:** `supabase/templates/invite.html`

**Where it fires:** every call to `supabase.auth.admin.inviteUserByEmail(...)`,
which today happens from:

- `createUserAction` (admin adds a new user — fires automatically)
- `inviteUserAction` / `resendInviteAction` (admin clicks "Resend
  invite" on `/admin/users`)

### Paste-in steps

1. Open the Supabase dashboard → your project → **Authentication →
   Email Templates → Invite user**.
2. Set **Subject** to:
   ```
   You've been added to Syncit
   ```
3. Copy the entire body of `supabase/templates/invite.html` into the
   **Message (HTML)** field. Overwrite everything that's there.
4. Set the **Site URL** (project-wide, not per-template) to your
   production Vercel URL — the template's `{{ .ConfirmationURL }}`
   is generated from it. `Auth → URL Configuration → Site URL`.
5. Add the same URL under **Redirect URLs** with `/auth/callback`
   appended so the invite link resolves back to the app instead of
   the login page.
6. Send yourself a test: **Authentication → Users → your row →
   "Send magic link"** — the invite template is also used by the
   generateLink magiclink fallback, so this exercises both paths.

### Variables the template uses

| Variable | Where it comes from |
|---|---|
| `{{ .Email }}` | recipient email |
| `{{ .Data.ownerName }}` | `data.ownerName` passed to `inviteUserByEmail` (see `sendInvite` in `admin/users/actions.ts`) |
| `{{ .ConfirmationURL }}` | invite acceptance URL — Supabase composes from Site URL + token |

### Design constraints

- **Inline styles only.** Gmail and Outlook strip `<style>` tags.
- **Table layout.** Some enterprise Outlook builds still ignore flexbox.
- **No external images.** The Syncit mark is an inline SVG — no
  outbound HTTP request from the mail client, no image-blocking
  placeholder, no privacy pixel accusation.
- **One primary CTA above the fold.** The web-console button.
  Mobile is a secondary line because most users won't sign in on web.
- **Explicit "ignore if you weren't expecting this" footer.** Standard
  invite-flow safety copy.

## Magic Link (SY-email sign-in code)

**Source of truth:** `supabase/templates/magic-link.html`

**Where it fires:** every call to `supabase.auth.signInWithOtp({ email, ... })`
from either the mobile app (`mobile/app/(auth)/email.tsx`) or the
web `/login/email-code` page. Supabase's template name says "Magic
Link"; we hijack it for the 6-digit OTP flow because Supabase
reuses this template for both magic links and email OTP.

### Paste-in steps

1. Supabase dashboard → **Authentication → Email Templates → Magic
   Link**.
2. Subject:
   ```
   Your Syncit sign-in code
   ```
3. Copy `supabase/templates/magic-link.html` into the **Message
   (HTML)** field.
4. In the **same dashboard section** → **Authentication → Providers
   → Email**, set:
   - **Enable Email OTP**: on
   - **Email OTP Expiration**: **600 seconds** (10 minutes). Anything
     shorter and users on slow inboxes lose the race; anything longer
     is more attack surface than SY-email wants.

### Why the template renders `{{ .Token }}` and not `{{ .ConfirmationURL }}`

Recorded in the template header comment and here so it survives a
future "let's just make it a link" refactor:

- On Android, Gmail opens links inside its own in-app WebView.
- Deep-linking back into an Expo app from that WebView is
  unreliable. It needs a verified Android App Link (assetlinks.json
  served on a verified domain over HTTPS with the correct SHA-256
  fingerprint) and even then fails on some OEM ROMs (MIUI, ColorOS).
- A 6-digit code the user READS and TYPES works on every device
  every time — no App Links plumbing, no assetlinks.json, no
  verified-domain dependency.

If Android link handling ever becomes bulletproof AND we want to
save the user a copy-paste, this is the file to change. Until then,
codes.

## Other templates

Confirm signup / Reset password — not customised yet.
When they matter, add a section here + a file under
`supabase/templates/`.
