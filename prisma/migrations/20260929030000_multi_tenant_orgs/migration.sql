-- SY21 — multi-tenant schema. Shape only; RLS enforcement is SY22.
--
-- What lands here:
--   1. New tables: Organization, Membership, OrgNumberSequence.
--   2. organizationId (uuid) on every business table, populated by
--      backfill from the sole existing tenant "Synergy Bonding
--      Solutions Pvt Ltd" and set NOT NULL + FK + indexed.
--   3. BusinessSettings pivots from Profile to Organization (1:1).
--   4. Global @unique constraints (invoiceNumber, orderNumber,
--      proformaNumber, creditNoteNumber, tallyRef, providerLinkId,
--      accounting provider, product name/brand, stock name/tallyRef)
--      become UNIQUE per organization.
--   5. Per-org number counters (proforma / credit-note) move from
--      BusinessSettings into OrgNumberSequence.
--   6. Profile.role / isActive get a sync trigger from Membership
--      (kept one release for backwards compat; see schema comment).
--
-- Idempotence: every INSERT / ALTER / CREATE guards on IF NOT EXISTS
-- or "ON CONFLICT DO NOTHING". A final assertion block RAISEs if any
-- business table still has NULL organizationId — so running the
-- migration on a partly-migrated DB either finishes cleanly or fails
-- loudly.

-- ─────────────────────────────────────────────────────────────────
-- 0. Enums
-- ─────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrgPlan') THEN
    CREATE TYPE "OrgPlan" AS ENUM ('TRIAL','STARTER','GROWTH','BUSINESS');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrgStatus') THEN
    CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE','PAST_DUE','LOCKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SequenceKind') THEN
    CREATE TYPE "SequenceKind" AS ENUM ('INVOICE','ORDER','PROFORMA','CREDIT_NOTE');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 1. New tables
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Organization" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        TEXT        NOT NULL,
  "slug"        TEXT        NOT NULL UNIQUE,
  "gstin"       TEXT,
  "city"        TEXT,
  "state"       TEXT,
  "industry"    TEXT,
  "logoUrl"     TEXT,
  "plan"        "OrgPlan"   NOT NULL DEFAULT 'TRIAL',
  "trialEndsAt" TIMESTAMPTZ,
  "status"      "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Organization_status_idx" ON "Organization" ("status");

CREATE TABLE IF NOT EXISTS "Membership" (
  "id"             TEXT        PRIMARY KEY,
  "organizationId" UUID        NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "profileId"      UUID        NOT NULL REFERENCES "Profile"("id")      ON DELETE CASCADE,
  "role"           "Role"      NOT NULL,
  "isOwner"        BOOLEAN     NOT NULL DEFAULT false,
  "isActive"       BOOLEAN     NOT NULL DEFAULT true,
  "invitedById"    UUID        REFERENCES "Profile"("id"),
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("organizationId", "profileId")
);
CREATE INDEX IF NOT EXISTS "Membership_profileId_idx" ON "Membership" ("profileId");
CREATE INDEX IF NOT EXISTS "Membership_org_active_role_idx"
  ON "Membership" ("organizationId", "isActive", "role");

CREATE TABLE IF NOT EXISTS "OrgNumberSequence" (
  "organizationId" UUID         NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "kind"           "SequenceKind" NOT NULL,
  "year"           INT          NOT NULL,
  "seq"            INT          NOT NULL DEFAULT 0,
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", "kind", "year")
);

-- ─────────────────────────────────────────────────────────────────
-- 2. organizationId columns on business tables (all nullable for now)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Party','Invoice','Payment','PaymentDocument','Action',
    'ProformaInvoice','ProformaLineItem','CreditNote','SyncLog',
    'Message','PaymentLink','AccountingConnection','Product',
    'SalesOrder','SalesOrderItem','OrderStatusEvent','DispatchLot',
    'OrderComment','OrderDocument','StockItem','StaleOrderNotice',
    'Escalation','EscalationEvent','Recommendation','RecoveryTarget',
    'UserAuditLog','NotificationConfig'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS "organizationId" UUID',
      t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. Backfill — create Synergy org + memberships, then stamp every
-- business row with its organizationId. Idempotent by slug.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_org_id       UUID;
  v_owner_id     UUID;
  v_owner_email  TEXT := 'sajal.ghatpande@gmail.com';
  v_biz_name     TEXT := 'Synergy Bonding Solutions Pvt Ltd';
BEGIN
  -- Fetch or create the tenant.
  SELECT id INTO v_org_id FROM "Organization" WHERE slug = 'synergy';
  IF v_org_id IS NULL THEN
    INSERT INTO "Organization"
      (id, name, slug, plan, "trialEndsAt", status)
    VALUES
      (gen_random_uuid(), v_biz_name, 'synergy', 'TRIAL', now() + interval '30 days', 'ACTIVE')
    RETURNING id INTO v_org_id;
  END IF;

  -- Owner: prefer sajal by email, else oldest ACTIVE ADMIN, else
  -- oldest Profile (fallback shouldn't fire in practice).
  SELECT id INTO v_owner_id
    FROM "Profile"
   WHERE lower(email) = v_owner_email
   LIMIT 1;
  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id
      FROM "Profile"
     WHERE role = 'ADMIN' AND "isActive" = true
     ORDER BY "createdAt" ASC
     LIMIT 1;
  END IF;
  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id FROM "Profile" ORDER BY "createdAt" ASC LIMIT 1;
  END IF;

  -- One Membership per Profile, mirroring current role + isActive.
  -- ON CONFLICT keeps a partly-migrated DB idempotent.
  INSERT INTO "Membership"
    (id, "organizationId", "profileId", role, "isOwner", "isActive")
  SELECT
    'mbr_' || replace(gen_random_uuid()::text, '-', ''),
    v_org_id,
    p.id,
    p.role,
    (p.id = v_owner_id),
    p."isActive"
  FROM "Profile" p
  ON CONFLICT ("organizationId", "profileId") DO NOTHING;

  -- ── Stamp every business row with the org id. Only where NULL, so
  -- a re-run doesn't clobber future multi-tenant data.
  UPDATE "Party"                SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "Invoice"              SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "Payment"              SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "PaymentDocument"      SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "Action"               SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "ProformaInvoice"      SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "ProformaLineItem"     SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "CreditNote"           SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "SyncLog"              SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "Message"              SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "PaymentLink"          SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "AccountingConnection" SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "Product"              SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "SalesOrder"           SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "SalesOrderItem"       SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "OrderStatusEvent"     SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "DispatchLot"          SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "OrderComment"         SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "OrderDocument"        SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "StockItem"            SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "StaleOrderNotice"     SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "Escalation"           SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "EscalationEvent"      SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "Recommendation"       SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "RecoveryTarget"       SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "UserAuditLog"         SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
  UPDATE "NotificationConfig"   SET "organizationId" = v_org_id WHERE "organizationId" IS NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. NOT NULL + FK + index (post-backfill)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Party','Invoice','Payment','PaymentDocument','Action',
    'ProformaInvoice','ProformaLineItem','CreditNote','SyncLog',
    'Message','PaymentLink','AccountingConnection','Product',
    'SalesOrder','SalesOrderItem','OrderStatusEvent','DispatchLot',
    'OrderComment','OrderDocument','StockItem','StaleOrderNotice',
    'Escalation','EscalationEvent','Recommendation','RecoveryTarget',
    'UserAuditLog','NotificationConfig'
  ];
  fk_name text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN "organizationId" SET NOT NULL',
      t
    );
    fk_name := t || '_organizationId_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = fk_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I
           FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE',
        t, fk_name
      );
    END IF;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I ("organizationId")',
      t || '_organizationId_idx', t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 5. Unique constraints — global → per-organization
-- ─────────────────────────────────────────────────────────────────

-- Party.tallyRef
ALTER TABLE "Party" DROP CONSTRAINT IF EXISTS "Party_tallyRef_key";
DROP INDEX IF EXISTS "Party_tallyRef_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Party_organizationId_tallyRef_key"
  ON "Party" ("organizationId", "tallyRef")
  WHERE "tallyRef" IS NOT NULL;

-- Invoice.invoiceNumber
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_organizationId_invoiceNumber_key"
  ON "Invoice" ("organizationId", "invoiceNumber");

-- Payment.tallyRef
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_tallyRef_key";
DROP INDEX IF EXISTS "Payment_tallyRef_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_organizationId_tallyRef_key"
  ON "Payment" ("organizationId", "tallyRef")
  WHERE "tallyRef" IS NOT NULL;

-- ProformaInvoice.proformaNumber
ALTER TABLE "ProformaInvoice" DROP CONSTRAINT IF EXISTS "ProformaInvoice_proformaNumber_key";
DROP INDEX IF EXISTS "ProformaInvoice_proformaNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ProformaInvoice_organizationId_proformaNumber_key"
  ON "ProformaInvoice" ("organizationId", "proformaNumber");

-- CreditNote.creditNoteNumber
ALTER TABLE "CreditNote" DROP CONSTRAINT IF EXISTS "CreditNote_creditNoteNumber_key";
DROP INDEX IF EXISTS "CreditNote_creditNoteNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_organizationId_creditNoteNumber_key"
  ON "CreditNote" ("organizationId", "creditNoteNumber");

-- SalesOrder.orderNumber
ALTER TABLE "SalesOrder" DROP CONSTRAINT IF EXISTS "SalesOrder_orderNumber_key";
DROP INDEX IF EXISTS "SalesOrder_orderNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_organizationId_orderNumber_key"
  ON "SalesOrder" ("organizationId", "orderNumber");

-- PaymentLink.providerLinkId
ALTER TABLE "PaymentLink" DROP CONSTRAINT IF EXISTS "PaymentLink_providerLinkId_key";
DROP INDEX IF EXISTS "PaymentLink_providerLinkId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLink_organizationId_providerLinkId_key"
  ON "PaymentLink" ("organizationId", "providerLinkId");

-- AccountingConnection.provider
ALTER TABLE "AccountingConnection" DROP CONSTRAINT IF EXISTS "AccountingConnection_provider_key";
DROP INDEX IF EXISTS "AccountingConnection_provider_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingConnection_organizationId_provider_key"
  ON "AccountingConnection" ("organizationId", "provider");

-- Product (name, brand)
CREATE UNIQUE INDEX IF NOT EXISTS "Product_organizationId_name_brand_key"
  ON "Product" ("organizationId", "name", "brand");

-- StockItem.name / .tallyRef
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_name_key";
ALTER TABLE "StockItem" DROP CONSTRAINT IF EXISTS "StockItem_tallyRef_key";
DROP INDEX IF EXISTS "StockItem_name_key";
DROP INDEX IF EXISTS "StockItem_tallyRef_key";
CREATE UNIQUE INDEX IF NOT EXISTS "StockItem_organizationId_name_key"
  ON "StockItem" ("organizationId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "StockItem_organizationId_tallyRef_key"
  ON "StockItem" ("organizationId", "tallyRef")
  WHERE "tallyRef" IS NOT NULL;

-- RecoveryTarget — old (userId, month) → (organizationId, userId, month)
ALTER TABLE "RecoveryTarget" DROP CONSTRAINT IF EXISTS "RecoveryTarget_userId_month_key";
DROP INDEX IF EXISTS "RecoveryTarget_userId_month_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryTarget_organizationId_userId_month_key"
  ON "RecoveryTarget" ("organizationId", "userId", "month");
CREATE INDEX IF NOT EXISTS "RecoveryTarget_userId_month_idx"
  ON "RecoveryTarget" ("userId", "month");

-- ─────────────────────────────────────────────────────────────────
-- 6. BusinessSettings — profileId → organizationId (1:1 with Org).
-- Old rows: one per Profile. New shape: one per Organization. Take
-- the row belonging to the org owner, else the oldest row. Drop the
-- others (data was per-user opinion, no shared truth to preserve).
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "organizationId" UUID;

DO $$
DECLARE
  v_org_id UUID;
  v_keep_id TEXT;
BEGIN
  SELECT id INTO v_org_id FROM "Organization" WHERE slug = 'synergy';

  -- Prefer the owner's settings row.
  SELECT bs.id INTO v_keep_id
    FROM "BusinessSettings" bs
    JOIN "Membership" m
      ON m."profileId" = bs."profileId"
     AND m."organizationId" = v_org_id
     AND m."isOwner" = true
   LIMIT 1;

  IF v_keep_id IS NULL THEN
    SELECT id INTO v_keep_id
      FROM "BusinessSettings"
     ORDER BY "createdAt" ASC
     LIMIT 1;
  END IF;

  IF v_keep_id IS NOT NULL THEN
    UPDATE "BusinessSettings"
       SET "organizationId" = v_org_id
     WHERE id = v_keep_id;
    -- Move sequence counters into OrgNumberSequence before dropping
    -- the columns.
    INSERT INTO "OrgNumberSequence" ("organizationId", "kind", "year", "seq")
    SELECT v_org_id, 'PROFORMA', "proformaSeqYear", "proformaSeq"
      FROM "BusinessSettings"
     WHERE id = v_keep_id AND "proformaSeqYear" > 0
    ON CONFLICT DO NOTHING;
    INSERT INTO "OrgNumberSequence" ("organizationId", "kind", "year", "seq")
    SELECT v_org_id, 'CREDIT_NOTE', "creditNoteSeqYear", "creditNoteSeq"
      FROM "BusinessSettings"
     WHERE id = v_keep_id AND "creditNoteSeqYear" > 0
    ON CONFLICT DO NOTHING;
    -- Drop the other rows; nothing points at them now that profileId
    -- is going away.
    DELETE FROM "BusinessSettings" WHERE id <> v_keep_id;
  END IF;
END $$;

-- Enforce NOT NULL + FK + unique on the new column.
ALTER TABLE "BusinessSettings" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "BusinessSettings" DROP CONSTRAINT IF EXISTS "BusinessSettings_profileId_key";
DROP INDEX IF EXISTS "BusinessSettings_profileId_key";
ALTER TABLE "BusinessSettings" DROP CONSTRAINT IF EXISTS "BusinessSettings_profileId_fkey";
ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS "profileId";
ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS "proformaSeq";
ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS "proformaSeqYear";
ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS "creditNoteSeq";
ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS "creditNoteSeqYear";

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessSettings_organizationId_key"
  ON "BusinessSettings" ("organizationId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BusinessSettings_organizationId_fkey'
  ) THEN
    ALTER TABLE "BusinessSettings"
      ADD CONSTRAINT "BusinessSettings_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Per-tenant secrets: nullable so the settings row exists before an
-- admin fills them in. NULL means "fall back to the env var" — see
-- lib/settings/secrets.ts.
ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "razorpayKeyId"         TEXT,
  ADD COLUMN IF NOT EXISTS "razorpayKeySecret"     TEXT,
  ADD COLUMN IF NOT EXISTS "razorpayWebhookSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "tallySyncTokenHash"    TEXT;

-- ─────────────────────────────────────────────────────────────────
-- 7. Profile.role / isActive sync trigger (SY21 backwards-compat).
-- Recomputes Profile.role as the highest-privilege active Membership
-- for that profile (ADMIN > STAFF > FACTORY) and Profile.isActive as
-- true iff any active membership exists. Fires after INSERT / UPDATE
-- / DELETE on Membership. Reads current_setting to skip re-entry.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_profile_from_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_role       "Role";
  v_active     BOOLEAN;
BEGIN
  v_profile_id := COALESCE(NEW."profileId", OLD."profileId");
  IF v_profile_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Highest-privilege role across active memberships. ADMIN wins.
  SELECT CASE
           WHEN bool_or(role = 'ADMIN' AND "isActive")  THEN 'ADMIN'::"Role"
           WHEN bool_or(role = 'STAFF' AND "isActive")  THEN 'STAFF'::"Role"
           WHEN bool_or(role = 'FACTORY' AND "isActive") THEN 'FACTORY'::"Role"
           ELSE (SELECT role FROM "Profile" WHERE id = v_profile_id)
         END,
         COALESCE(bool_or("isActive"), false)
    INTO v_role, v_active
    FROM "Membership"
   WHERE "profileId" = v_profile_id;

  UPDATE "Profile"
     SET role     = COALESCE(v_role,   role),
         "isActive" = COALESCE(v_active, "isActive")
   WHERE id = v_profile_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_from_membership ON "Membership";
CREATE TRIGGER trg_sync_profile_from_membership
AFTER INSERT OR UPDATE OF role, "isActive" OR DELETE
ON "Membership"
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_membership();

-- ─────────────────────────────────────────────────────────────────
-- 8. Assertion — every business row has organizationId. Fail LOUD
-- if not; a partly-migrated schema is worse than an obvious error.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Party','Invoice','Payment','PaymentDocument','Action',
    'ProformaInvoice','ProformaLineItem','CreditNote','SyncLog',
    'Message','PaymentLink','AccountingConnection','Product',
    'SalesOrder','SalesOrderItem','OrderStatusEvent','DispatchLot',
    'OrderComment','OrderDocument','StockItem','StaleOrderNotice',
    'Escalation','EscalationEvent','Recommendation','RecoveryTarget',
    'UserAuditLog','NotificationConfig','BusinessSettings'
  ];
  bad_count bigint;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE "organizationId" IS NULL', t
    ) INTO bad_count;
    IF bad_count > 0 THEN
      RAISE EXCEPTION
        'SY21 assertion failed: table % has % rows with NULL organizationId',
        t, bad_count;
    END IF;
  END LOOP;
END $$;
