-- SY28 — platform billing + LOCKED read-only mode.
--
-- 1. Organization billing columns (Razorpay Subscriptions on Syncit's
--    own account — never the org's customer-payment Razorpay keys).
-- 2. BillingInvoice / BillingSequence / BillingEvent tables. RLS on,
--    no policies: only the service role (webhook, billing page via
--    Prisma) touches them.
-- 3. LOCKED = read-only everywhere:
--      a. RESTRICTIVE RLS write policies on every tenant table —
--         INSERT/UPDATE/DELETE refused when current_org_writable()
--         is false. Covers direct Supabase clients (mobile).
--      b. BEFORE INSERT/UPDATE/DELETE trigger on the same tables.
--         Covers SECURITY DEFINER RPCs and Prisma (which bypass RLS).
--         A transaction may opt out with
--           SELECT set_config('syncit.lock_bypass', 'on', true)
--         — used only by inbound webhooks that must record facts
--         (customer opt-outs, payment-link status) while locked.
--    SELECT is never restricted, so export keeps working.
-- 4. current_org_status() RPC for the web middleware write gate.
-- 5. Synergy: plan BUSINESS, status ACTIVE, billing exempt.

-- ─────────────────────────────────────────────────────────────────
-- 1. Organization columns
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "billingExempt"          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "razorpayCustomerId"     TEXT,
  ADD COLUMN IF NOT EXISTS "razorpaySubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus"     TEXT,
  ADD COLUMN IF NOT EXISTS "billingCycle"           TEXT,
  ADD COLUMN IF NOT EXISTS "currentPeriodEnd"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pendingPlan"            "OrgPlan",
  ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd"      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lockedAt"               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lockReason"             TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_razorpaySubscriptionId_key"
  ON "Organization" ("razorpaySubscriptionId");

-- ─────────────────────────────────────────────────────────────────
-- 2. Billing tables
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BillingInvoice" (
  "id"                     TEXT        PRIMARY KEY,
  "organizationId"         UUID        NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "invoiceNumber"          TEXT        NOT NULL UNIQUE,
  "razorpayPaymentId"      TEXT        NOT NULL UNIQUE,
  "razorpayInvoiceId"      TEXT,
  "razorpaySubscriptionId" TEXT        NOT NULL,
  "plan"                   "OrgPlan"   NOT NULL,
  "billingCycle"           TEXT        NOT NULL,
  "periodStart"            TIMESTAMPTZ,
  "periodEnd"              TIMESTAMPTZ,
  "totalPaise"             INTEGER     NOT NULL,
  "taxablePaise"           INTEGER     NOT NULL,
  "gstPaise"               INTEGER     NOT NULL,
  "customerName"           TEXT        NOT NULL,
  "customerGstin"          TEXT,
  "customerState"          TEXT,
  "issuedAt"               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "BillingInvoice_organizationId_issuedAt_idx"
  ON "BillingInvoice" ("organizationId", "issuedAt");

CREATE TABLE IF NOT EXISTS "BillingSequence" (
  "fy"   TEXT    PRIMARY KEY,
  "last" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "BillingEvent" (
  "id"             TEXT        PRIMARY KEY,
  "event"          TEXT        NOT NULL,
  "organizationId" UUID,
  "receivedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "BillingInvoice"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingEvent"    ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- 3. LOCKED read-only
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_org_writable()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.status <> 'LOCKED'
       FROM "Organization" o
      WHERE o.id = public.current_org_id()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.current_org_writable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_writable() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_writable() TO service_role;

CREATE OR REPLACE FUNCTION public.current_org_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.status::text
    FROM "Organization" o
   WHERE o.id = public.current_org_id();
$$;

REVOKE ALL ON FUNCTION public.current_org_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_status() TO authenticated;

COMMENT ON FUNCTION public.current_org_status() IS
  'SY28 — status of the caller''s active organization (ACTIVE|PAST_DUE|LOCKED), or NULL with no org context. Read by middleware to refuse web writes while LOCKED.';

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
  IF v_status = 'LOCKED' THEN
    RAISE EXCEPTION 'SYNCIT_ORG_LOCKED: this workspace is read-only until a plan is chosen'
      USING ERRCODE = 'SYLCK';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

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
    'UserAuditLog','NotificationConfig','BusinessSettings',
    'OrgNumberSequence'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'sy28_locked_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR INSERT TO authenticated
         WITH CHECK (public.current_org_writable())',
      'sy28_locked_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'sy28_locked_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR UPDATE TO authenticated
         USING (public.current_org_writable())
         WITH CHECK (public.current_org_writable())',
      'sy28_locked_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'sy28_locked_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR DELETE TO authenticated
         USING (public.current_org_writable())',
      'sy28_locked_delete', t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_sy28_guard_org_writable', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION public.guard_org_writable()',
      'trg_sy28_guard_org_writable', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Existing orgs stamped PAST_DUE by the SY23 trial cron become
--    LOCKED. Nothing sets PAST_DUE any more: trial end and payment
--    failure both go straight to LOCKED.
-- ─────────────────────────────────────────────────────────────────

UPDATE "Organization"
   SET status = 'LOCKED', "lockedAt" = now(), "lockReason" = 'TRIAL_ENDED'
 WHERE status = 'PAST_DUE' AND plan = 'TRIAL';

-- ─────────────────────────────────────────────────────────────────
-- 5. Synergy Bonding — pilot tenant, Business plan, no billing.
-- ─────────────────────────────────────────────────────────────────

UPDATE "Organization"
   SET plan = 'BUSINESS',
       status = 'ACTIVE',
       "billingExempt" = true,
       "trialEndsAt" = NULL,
       "lockedAt" = NULL,
       "lockReason" = NULL
 WHERE slug = 'synergy';
