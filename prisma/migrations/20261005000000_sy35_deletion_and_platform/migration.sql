-- SY35 — account deletion, company deletion, platform console.
--
-- 1. Organization.status gains DELETING (30-day soft delete, read-only)
--    and DELETED (tombstone after the hard delete). The tombstone row
--    stays because BillingInvoice (Syncit's own GST tax invoices, which
--    must be retained) references it ON DELETE RESTRICT; it is
--    anonymised when the company's data is purged.
-- 2. Deletion bookkeeping columns on Organization; Profile.deletedAt
--    marks an account deleted by its owner ("Former member").
-- 3. PlatformAuditLog — every /platform action. RLS on, no policies,
--    and no grants for anon / authenticated: service role only.
-- 4. DELETING / DELETED are read-only exactly like LOCKED: the SY28
--    write guard trigger and RESTRICTIVE policies (via
--    current_org_writable) refuse writes; reads and export still work.
--    Comparisons are on status::text so the new enum values are never
--    cast inside this migration's transaction.

ALTER TYPE "OrgStatus" ADD VALUE IF NOT EXISTS 'DELETING';
ALTER TYPE "OrgStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "deletionRequestedAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deletionRequestedById"  UUID,
  ADD COLUMN IF NOT EXISTS "deletionScheduledFor"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deletionReminderSentAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "statusBeforeDeletion"   TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt"              TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Organization_deletionScheduledFor_idx"
  ON "Organization" ("deletionScheduledFor");

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────
-- PlatformAuditLog
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PlatformAuditLog" (
  "id"             TEXT        PRIMARY KEY,
  "actorId"        UUID        NOT NULL,
  "actorEmail"     TEXT        NOT NULL,
  "action"         TEXT        NOT NULL,
  "organizationId" UUID        REFERENCES "Organization"("id") ON DELETE SET NULL,
  "detail"         JSONB,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_organizationId_createdAt_idx"
  ON "PlatformAuditLog" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformAuditLog_createdAt_idx"
  ON "PlatformAuditLog" ("createdAt");

ALTER TABLE "PlatformAuditLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PlatformAuditLog" FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE "PlatformAuditLog" FROM anon, authenticated';
  EXECUTE 'GRANT ALL ON TABLE "PlatformAuditLog" TO service_role';
EXCEPTION WHEN undefined_object THEN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- DELETING / DELETED are read-only (same as LOCKED).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_org_writable()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.status::text NOT IN ('LOCKED', 'DELETING', 'DELETED')
       FROM "Organization" o
      WHERE o.id = public.current_org_id()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_org_writable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org    uuid;
  v_status text;
BEGIN
  IF current_setting('syncit.lock_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_org := OLD."organizationId";
  ELSE
    v_org := NEW."organizationId";
  END IF;
  IF v_org IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT o.status::text INTO v_status FROM "Organization" o WHERE o.id = v_org;
  IF v_status IN ('LOCKED', 'DELETING', 'DELETED') THEN
    RAISE EXCEPTION 'SYNCIT_ORG_LOCKED: this workspace is read-only'
      USING ERRCODE = 'SYLCK';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
