-- SY42 — company onboarding, staff invitations and lead capture.
--
--   * SignupLead  — one row per self-serve sign-up: who, which company,
--     GSTIN, where they came from (utm / referrer / landing page).
--     Platform table: no tenant RLS exposure, service role / Prisma only.
--     Deliberately NO foreign keys, so a lead survives company deletion.
--   * Invitation  — pending / accepted / revoked / expired staff invites.
--     Only the SHA-256 of the token is stored.
--   * Organization — address, pincode, teamSize, signupSource.
--
-- Idempotent, like every migration since SY33. Not applied by the
-- feature commit — run it before deploying.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "address"      TEXT,
  ADD COLUMN IF NOT EXISTS "pincode"      TEXT,
  ADD COLUMN IF NOT EXISTS "teamSize"     TEXT,
  ADD COLUMN IF NOT EXISTS "signupSource" TEXT;

DO $$ BEGIN
  CREATE TYPE "SignupLeadStatus" AS ENUM ('PENDING_VERIFY', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SignupLead" (
  "id"             TEXT              PRIMARY KEY,
  "status"         "SignupLeadStatus" NOT NULL DEFAULT 'PENDING_VERIFY',
  "authMethod"     TEXT              NOT NULL,
  "profileId"      UUID,
  "organizationId" UUID,
  "ownerName"      TEXT              NOT NULL,
  "email"          TEXT              NOT NULL,
  "phone"          TEXT,
  "designation"    TEXT,
  "companyName"    TEXT              NOT NULL,
  "gstin"          TEXT,
  "address"        TEXT,
  "city"           TEXT,
  "state"          TEXT,
  "pincode"        TEXT,
  "industry"       TEXT,
  "teamSize"       TEXT,
  "utmSource"      TEXT,
  "utmMedium"      TEXT,
  "utmCampaign"    TEXT,
  "utmTerm"        TEXT,
  "utmContent"     TEXT,
  "gclid"          TEXT,
  "fbclid"         TEXT,
  "referrer"       TEXT,
  "landingPath"    TEXT,
  "referralCode"   TEXT,
  "firstSeenAt"    TIMESTAMPTZ,
  "ip"             TEXT,
  "userAgent"      TEXT,
  "createdAt"      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  "completedAt"    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "SignupLead_email_idx"     ON "SignupLead" ("email");
CREATE INDEX IF NOT EXISTS "SignupLead_profileId_idx" ON "SignupLead" ("profileId");
CREATE INDEX IF NOT EXISTS "SignupLead_status_createdAt_idx" ON "SignupLead" ("status", "createdAt");

CREATE TABLE IF NOT EXISTS "Invitation" (
  "id"                TEXT             PRIMARY KEY,
  "organizationId"    UUID             NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "email"             TEXT             NOT NULL,
  "role"              "Role"           NOT NULL,
  "ownerName"         TEXT,
  "phone"             TEXT,
  "tokenHash"         TEXT             NOT NULL,
  "status"            "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "invitedById"       UUID             NOT NULL,
  "expiresAt"         TIMESTAMPTZ      NOT NULL,
  "lastSentAt"        TIMESTAMPTZ      NOT NULL DEFAULT now(),
  "sendCount"         INTEGER          NOT NULL DEFAULT 1,
  "acceptedAt"        TIMESTAMPTZ,
  "acceptedProfileId" UUID,
  "createdAt"         TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_tokenHash_key" ON "Invitation" ("tokenHash");
CREATE INDEX IF NOT EXISTS "Invitation_org_status_idx" ON "Invitation" ("organizationId", "status");
-- One live invite per person per company.
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_one_pending_key"
  ON "Invitation" ("organizationId", lower("email")) WHERE "status" = 'PENDING';

-- Platform-only: service role / Prisma. No tenant policies, no grants.
ALTER TABLE "SignupLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignupLead" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SignupLead" FROM PUBLIC;

-- Invitation holds a token hash and invitee emails: same treatment.
-- The Team page reads it through the server (tenantDb), not PostgREST.
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Invitation" FROM PUBLIC;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE "SignupLead" FROM anon, authenticated';
  EXECUTE 'REVOKE ALL ON TABLE "Invitation" FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
