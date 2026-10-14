-- SY36 — mobile field UX (sales "Today" tab, optional app lock).
--
-- 1. stamp_org_id trigger. The mobile app writes a few tables straight
--    through PostgREST (Payment, PaymentDocument, OrderComment,
--    OrderDocument, OrderStatusEvent, Party, and now Action). Those
--    inserts never carried organizationId, and since SY21 made the
--    column NOT NULL with no default they were being refused. The
--    trigger fills organizationId from public.current_org_id() when the
--    client leaves it out. It never overrides a value that was sent —
--    a wrong one is still refused by the sy22_tenant_isolation
--    RESTRICTIVE policy — and with no active company the column stays
--    NULL and the NOT NULL constraint refuses the row.
--    A trigger (not a column DEFAULT) so prisma/schema.prisma has
--    nothing to drift against.
--
-- 2. Action INSERT policies, so "Promise" on the Today tab can write
--    the same PROMISE_TO_PAY follow-up the web form writes. STAFF may
--    record a follow-up only for a customer assigned to them; ADMIN for
--    any customer of their company. Role comes from
--    public.current_user_role() (Membership in the active company).
--
-- 3. PaymentLink SELECT policies, so the WhatsApp reminder can include
--    the customer's open payment link. Same visibility as Invoice.
--
-- 4. BusinessSettings.requireAppLock — company setting that makes the
--    phone's app lock compulsory instead of offered.

-- ─────────────────────────────────────────────────────────────────
-- 1. organizationId stamp for direct client inserts
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.stamp_org_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."organizationId" IS NULL THEN
    NEW."organizationId" := public.current_org_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions are not called directly; nobody needs EXECUTE.
REVOKE ALL ON FUNCTION public.stamp_org_id() FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.stamp_org_id() FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

COMMENT ON FUNCTION public.stamp_org_id() IS
  'SY36 — BEFORE INSERT: fill organizationId from current_org_id() when the client omitted it. Never overrides a supplied value.';

DO $$
DECLARE
  t text;
  -- Tables the mobile app inserts into directly (no RPC).
  tables text[] := ARRAY[
    'Payment','PaymentDocument','Action','OrderComment','OrderDocument',
    'OrderStatusEvent','Party'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Named to sort before trg_sy28_guard_org_writable: BEFORE triggers
    -- fire in name order, and the read-only guard must see the stamped
    -- company.
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_stamp_org_id', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION public.stamp_org_id()',
      'trg_stamp_org_id', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. Action INSERT (follow-ups recorded from the phone)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Action" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_insert_staff ON "Action";
DROP POLICY IF EXISTS action_insert_admin ON "Action";

CREATE POLICY action_insert_staff ON "Action"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'STAFF'
    AND "performedById" = auth.uid()
    AND "organizationId" = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM "Party" p
       WHERE p.id = "Action"."partyId"
         AND p."organizationId" = public.current_org_id()
         AND p."assignedToId" = auth.uid()
    )
  );

CREATE POLICY action_insert_admin ON "Action"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND "performedById" = auth.uid()
    AND "organizationId" = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM "Party" p
       WHERE p.id = "Action"."partyId"
         AND p."organizationId" = public.current_org_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. PaymentLink SELECT (read-only on the phone)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "PaymentLink" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_link_select_staff ON "PaymentLink";
DROP POLICY IF EXISTS payment_link_select_admin ON "PaymentLink";

CREATE POLICY payment_link_select_staff ON "PaymentLink"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND "organizationId" = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM "Party" p
       WHERE p.id = "PaymentLink"."partyId"
         AND p."organizationId" = public.current_org_id()
         AND p."assignedToId" = auth.uid()
    )
  );

CREATE POLICY payment_link_select_admin ON "PaymentLink"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND "organizationId" = public.current_org_id()
  );

-- ─────────────────────────────────────────────────────────────────
-- 4. Company setting: require the app lock on phones
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "requireAppLock" BOOLEAN NOT NULL DEFAULT false;
