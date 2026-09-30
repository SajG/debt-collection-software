-- SY23 — self-serve signup + onboarding.
--
-- Schema deltas:
--   * BusinessSettings.requireManagement2fa (bool, default false)
--     Synergy row is flipped to true so nothing changes for the pilot.
--   * BusinessSettings.onboardingStep (text, nullable) — resumable
--     wizard state ('company'|'team'|'data'|'done').
--   * BusinessSettings.sampleDataSeeded (bool, default false) — arms
--     the one-click purge of the demo dataset from the wizard.
--   * SignupAttempt table + indexes — POST /api/signup records every
--     attempt per (ip, emailDomain) so the per-IP burst cap and the
--     per-domain daily cap can be enforced without touching Supabase.

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "requireManagement2fa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "onboardingStep"       TEXT,
  ADD COLUMN IF NOT EXISTS "sampleDataSeeded"     BOOLEAN NOT NULL DEFAULT false;

-- Synergy keeps the current MFA posture.
UPDATE "BusinessSettings" bs
   SET "requireManagement2fa" = true
  FROM "Organization" o
 WHERE bs."organizationId" = o.id
   AND o.slug = 'synergy';

CREATE TABLE IF NOT EXISTS "SignupAttempt" (
  "id"          TEXT        PRIMARY KEY,
  "emailDomain" TEXT        NOT NULL,
  "ip"          TEXT        NOT NULL,
  "successful"  BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SignupAttempt_ip_createdAt_idx"
  ON "SignupAttempt" ("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "SignupAttempt_emailDomain_createdAt_idx"
  ON "SignupAttempt" ("emailDomain", "createdAt");
