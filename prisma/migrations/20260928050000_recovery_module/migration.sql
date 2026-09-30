-- Recovery module tables. These were previously deployed via
-- `prisma/sql/2026-07-21-*.sql` scripts run by hand per the README.
-- Codifying them here so a fresh deploy stands up cleanly and the
-- SY21 multi_tenant migration has tables to add organizationId to.
--
-- Idempotent: every CREATE guards on IF NOT EXISTS. Existing prod
-- databases that already ran the ad-hoc scripts see no changes.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EscalationStage') THEN
    CREATE TYPE "EscalationStage" AS ENUM ('FLAGGED', 'NOTICE', 'FINAL_NOTICE', 'LEGAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EscalationStatus') THEN
    CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RecoveryTarget" (
  "id"           TEXT PRIMARY KEY,
  "userId"       UUID NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "month"        TIMESTAMP(3) NOT NULL,
  "targetAmount" DECIMAL(12,2) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  UNIQUE ("userId", "month")
);

CREATE TABLE IF NOT EXISTS "Escalation" (
  "id"         TEXT PRIMARY KEY,
  "partyId"    TEXT NOT NULL REFERENCES "Party"("id") ON DELETE RESTRICT,
  "stage"      "EscalationStage"  NOT NULL DEFAULT 'FLAGGED',
  "status"     "EscalationStatus" NOT NULL DEFAULT 'OPEN',
  "reason"     TEXT NOT NULL,
  "openedById" UUID REFERENCES "Profile"("id"),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Escalation_status_stage_idx" ON "Escalation" ("status", "stage");
CREATE INDEX IF NOT EXISTS "Escalation_partyId_idx" ON "Escalation" ("partyId");

CREATE TABLE IF NOT EXISTS "EscalationEvent" (
  "id"           TEXT PRIMARY KEY,
  "escalationId" TEXT NOT NULL REFERENCES "Escalation"("id") ON DELETE CASCADE,
  "fromStage"    "EscalationStage",
  "toStage"      "EscalationStage" NOT NULL,
  "note"         TEXT NOT NULL,
  "byId"         UUID REFERENCES "Profile"("id"),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EscalationEvent_escalationId_createdAt_idx"
  ON "EscalationEvent" ("escalationId", "createdAt");

CREATE TABLE IF NOT EXISTS "Recommendation" (
  "id"          TEXT PRIMARY KEY,
  "partyId"     TEXT UNIQUE NOT NULL REFERENCES "Party"("id") ON DELETE CASCADE,
  "content"     JSONB NOT NULL,
  "model"       TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One-open-escalation-per-party constraint (was applied manually via
-- prisma/sql/2026-07-21-escalation-open-unique.sql on Synergy).
CREATE UNIQUE INDEX IF NOT EXISTS "Escalation_partyId_open_unique"
  ON "Escalation" ("partyId")
  WHERE "status" = 'OPEN';
