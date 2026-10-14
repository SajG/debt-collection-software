# Company onboarding, invites and lead capture — plan

Spec: `docs/superpowers/specs/2026-10-14-company-onboarding-and-invites-design.md`

Each task ends with `npx tsc --noEmit` and lint on touched files. Do NOT run
`npm test` (hits the live DB). Do NOT apply migrations.

## Phase A — lead capture + password auth (web)

- [x] A1 Migration `20261014100000_sy42_leads_invites`: `SignupLead`,
      `Invitation`, enums, Organization columns, partial unique index.
      Update `prisma/schema.prisma`; `prisma generate`.
- [x] A2 `lib/validation/gstin.ts` (+ unit test), `lib/attribution.ts`
      (parse/serialize first-touch cookie, + unit test).
- [x] A3 Attribution capture: `middleware.ts` sets `syncit_attr` on first
      marketing hit (utm, gclid, fbclid, referrer, landing path).
- [x] A4 `lib/platform/leads.ts`: createLead, completeLead, findPendingLead.
- [x] A5 `lib/auth/finish-sign-in.ts`: extract post-auth routing from
      `verifyEmailCodeAction`; reuse in password + code paths.
- [x] A6 Signup: new form (all lead fields + password + Google),
      `signUpWithPasswordAction`; callback provisions from pending lead.
- [x] A7 `/signup/complete` for Google users without a company.
- [x] A8 Login: password form, forgot password, `/reset-password`,
      keep code fallback. Update `docs/LOGIN-RUNBOOK.md`.

## Phase B — invitations

- [x] B1 `lib/platform/invitations.ts`: create/resend/revoke/accept,
      token hash, expiry, seat checks (+ unit test for token helpers).
- [x] B2 `teamInviteEmail` template + send via Resend.
- [x] B3 Server actions `inviteMemberAction`, `resendInvitationAction`,
      `revokeInvitationAction` in admin/users actions.
- [x] B4 `/join/[token]` page + `acceptInvitationAction`.
- [x] B5 Team page: invite form (email-first), pending list, resend/revoke.
- [x] B6 Onboarding wizard team step → invitations.

## Phase C — mobile

- [x] C1 Email screen: password option + "use a code instead".
- [x] C2 Copy for "no invite found" (en/hi/mr).

## Phase D — rollout (owner)

- Apply migration to a staging DB, then prod (before deploy).
- Supabase: enable email+password, confirm email, leaked-password
  protection; set Site URL + redirect `/auth/callback`.
- Set `SIGNUP_ENABLED=true`; replace placeholder WhatsApp number.
- Ship mobile build with C1/C2.
