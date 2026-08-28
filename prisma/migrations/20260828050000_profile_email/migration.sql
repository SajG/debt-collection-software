-- profile_email
--
-- Adds email as the authentication channel for Syncit. Phone stays
-- the identity / display anchor — it maps to Tally cost centres and
-- appears throughout the UI. Email is the NEW second channel;
-- neither replaces the other.
--
-- What this touches:
--
--   1. Profile gains email + invitedAt + invitedById + firstSignInAt.
--      email is unique (nullable — existing rows carry NULL until
--      Sajal collects real addresses; see scripts/backfill-team-
--      emails.ts).
--
--   2. UserAuditAction enum gains INVITED + INVITE_RESENT.
--
--   3. RLS: Profile SELECT policy is already own-row only
--      (`profile_select_own`, migration 20260821120000), so email is
--      readable by its owner and by service_role/Prisma. STAFF
--      cannot enumerate colleague emails.
--
--   4. get_profile_directory() is EXPLICITLY NOT widened. STAFF
--      must not be able to list colleague email addresses. See the
--      header of migration 20260824120000_add_profile_directory_read
--      for the reasoning that still applies. A COMMENT is added so
--      a future refactor sees the invariant on `\df+`.

-- ─────────────────────────────────────────────────────────────────
-- 1. Enum values
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'UserAuditAction' AND e.enumlabel = 'INVITED'
  ) THEN
    ALTER TYPE "UserAuditAction" ADD VALUE 'INVITED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'UserAuditAction' AND e.enumlabel = 'INVITE_RESENT'
  ) THEN
    ALTER TYPE "UserAuditAction" ADD VALUE 'INVITE_RESENT';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. Profile columns
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "email"          text,
  ADD COLUMN IF NOT EXISTS "invitedAt"      timestamptz,
  ADD COLUMN IF NOT EXISTS "invitedById"    uuid REFERENCES "Profile"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "firstSignInAt"  timestamptz;

-- Unique on email but ONLY for non-null values (multiple rows can
-- legitimately have no email while backfill is in progress).
CREATE UNIQUE INDEX IF NOT EXISTS "Profile_email_key"
  ON "Profile" ("email")
  WHERE "email" IS NOT NULL;

-- Reject fake / unroutable domains at the DB layer as a
-- belt-and-braces stop against the old @synworks.local pattern.
-- The admin UI validator catches this too; the DB check is what
-- stops a rogue backfill script.
ALTER TABLE "Profile"
  DROP CONSTRAINT IF EXISTS "Profile_email_real_domain";
ALTER TABLE "Profile"
  ADD CONSTRAINT "Profile_email_real_domain"
  CHECK (
    "email" IS NULL
    OR (
      "email" LIKE '%@%.%'
      AND lower("email") !~ '\.(local|test|invalid|internal|localhost|example)$'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. Invariant reminder on the directory RPC
-- ─────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.get_profile_directory() IS
  'STAFF/FACTORY/ADMIN safe directory: id, ownerName, role, phone. Do NOT add email — STAFF must not be able to enumerate colleague email addresses. See the header of 20260828050000_profile_email for the reasoning.';
