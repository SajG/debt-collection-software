-- SY38 — growth: activation milestones + lifecycle emails, referrals.
--
-- OrgLifecycleEvent  one row per (company, key), written once:
--     milestone:*  the first time a company does something
--                  (first order, first payment, Tally connected, …) —
--                  the activation events the daily cron checks and the
--                  moment the matching PostHog event is sent;
--     email:*      a lifecycle email that has been sent, so each goes
--                  to a company at most once.
-- ReferralReward     one row per referred company, created when it
--                  first pays; records what each side was given.
--
-- Both are platform tables: written only by the server (Prisma /
-- service role). RLS is ON with no policies, and the client roles get
-- no grants, so the mobile app and PostgREST cannot read or write them.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "referralCode" TEXT,
  ADD COLUMN IF NOT EXISTS "referredByOrgId" UUID,
  ADD COLUMN IF NOT EXISTS "marketingEmailsOptOut" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_referralCode_key"
  ON "Organization" ("referralCode");
CREATE INDEX IF NOT EXISTS "Organization_referredByOrgId_idx"
  ON "Organization" ("referredByOrgId");

CREATE TABLE IF NOT EXISTS "OrgLifecycleEvent" (
  "id"             TEXT        PRIMARY KEY,
  "organizationId" UUID        NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "key"            TEXT        NOT NULL,
  "occurredAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "detail"         JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgLifecycleEvent_organizationId_key_key"
  ON "OrgLifecycleEvent" ("organizationId", "key");

CREATE TABLE IF NOT EXISTS "ReferralReward" (
  "id"              TEXT        PRIMARY KEY,
  "referrerOrgId"   UUID        NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "referredOrgId"   UUID        NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "referrerOutcome" TEXT        NOT NULL,
  "referredOutcome" TEXT        NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A company can be the referred side of exactly one reward.
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralReward_referredOrgId_key"
  ON "ReferralReward" ("referredOrgId");
CREATE INDEX IF NOT EXISTS "ReferralReward_referrerOrgId_idx"
  ON "ReferralReward" ("referrerOrgId");

ALTER TABLE "OrgLifecycleEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgLifecycleEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReferralReward"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralReward"    FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON "OrgLifecycleEvent", "ReferralReward" FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
