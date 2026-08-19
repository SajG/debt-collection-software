-- Admin user management: isActive on Profile, an append-only audit
-- log, and enforcement at every layer (RLS via current_user_role,
-- create_sales_order RPC, PushToken policies, plus DB-level guardrails
-- that block deactivating the last active ADMIN).
--
-- Impact statement (before touching anything working):
--   - current_user_role() is rewritten to also require isActive=true.
--     Every existing domain policy already gates on current_user_role
--     (verified across Party/Invoice/Payment/Message/Action/SalesOrder/
--     OrderStatusEvent/OrderDocument/OrderComment/StockItem/Product/
--     DispatchLot/NotificationConfig/PaymentDocument + storage.objects
--     for order-documents and payment-proofs), so those policies pick
--     up the lock-out with zero policy edits.
--   - PushToken policies were the one exception — they used ONLY
--     auth.uid() with no role check. Each is augmented with
--     AND public.current_user_role() IS NOT NULL so a deactivated
--     user cannot re-insert a token after the deactivation trigger
--     clears their existing rows.
--   - create_sales_order() is SECURITY DEFINER and read Profile
--     directly. Extends its role gate with v_profile."isActive".
--   - Nothing is widened. All other RLS is untouched.

-- ─────────────────────────────────────────────────────────────────
-- Profile columns
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "isActive"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deactivatedAt"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deactivatedById" UUID REFERENCES "Profile"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "createdById"     UUID REFERENCES "Profile"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Profile_isActive_role_idx"
  ON "Profile" ("isActive", "role");

-- ─────────────────────────────────────────────────────────────────
-- UserAuditLog — append-only. No UPDATE / DELETE policies.
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserAuditAction') THEN
    CREATE TYPE "UserAuditAction" AS ENUM (
      'CREATED',
      'ACTIVATED',
      'DEACTIVATED',
      'ROLE_CHANGED',
      'PHONE_CHANGED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "UserAuditLog" (
  "id"              TEXT PRIMARY KEY,
  "actorId"         UUID REFERENCES "Profile"("id") ON DELETE SET NULL,
  "targetProfileId" UUID NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "action"          "UserAuditAction" NOT NULL,
  "detail"          TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "UserAuditLog_targetProfileId_createdAt_idx"
  ON "UserAuditLog" ("targetProfileId", "createdAt" DESC);

ALTER TABLE "UserAuditLog" ENABLE ROW LEVEL SECURITY;

-- SELECT for admins only. NO insert/update/delete policies — writes
-- happen through service_role (server actions on the admin/users page).
DROP POLICY IF EXISTS user_audit_log_select_admin ON "UserAuditLog";
CREATE POLICY user_audit_log_select_admin ON "UserAuditLog"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- current_user_role — return NULL when the caller's Profile is
-- inactive so every downstream policy denies. STABLE + SECURITY
-- DEFINER unchanged; the function still bypasses RLS to read Profile.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p."isActive" THEN p."role"::text ELSE NULL END
  FROM "Profile" p
  WHERE p.id = auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────────
-- PushToken policies — add an active-user gate so a deactivated user
-- cannot re-register a token after the deactivation trigger clears
-- their rows.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS push_token_select_own ON "PushToken";
DROP POLICY IF EXISTS push_token_insert_own ON "PushToken";
DROP POLICY IF EXISTS push_token_update_own ON "PushToken";
DROP POLICY IF EXISTS push_token_delete_own ON "PushToken";

CREATE POLICY push_token_select_own ON "PushToken"
  FOR SELECT TO authenticated
  USING (
    "profileId" = auth.uid()
    AND public.current_user_role() IS NOT NULL
  );

CREATE POLICY push_token_insert_own ON "PushToken"
  FOR INSERT TO authenticated
  WITH CHECK (
    "profileId" = auth.uid()
    AND public.current_user_role() IS NOT NULL
  );

CREATE POLICY push_token_update_own ON "PushToken"
  FOR UPDATE TO authenticated
  USING ("profileId" = auth.uid() AND public.current_user_role() IS NOT NULL)
  WITH CHECK ("profileId" = auth.uid() AND public.current_user_role() IS NOT NULL);

CREATE POLICY push_token_delete_own ON "PushToken"
  FOR DELETE TO authenticated
  USING ("profileId" = auth.uid() AND public.current_user_role() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- create_sales_order — extend the role gate with isActive. Function
-- is SECURITY DEFINER and reads Profile directly, so without this a
-- deactivated STAFF/ADMIN would still be able to place orders even
-- with RLS otherwise closed to them.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_sales_order(
  p_party_id              text,
  p_product_id            text,
  p_brand                 text,
  p_quantity              numeric,
  p_quantity_unit         text,
  p_packing_type          text,
  p_size_kg               text,
  p_product_rate          text,
  p_payment_term          text,
  p_transport_type        text,
  p_expected_delivery_date date,
  p_token_type            text,
  p_notes                 text,
  p_new_customer_name     text DEFAULT NULL,
  p_dispatch_location     text DEFAULT NULL,
  p_new_product_name      text DEFAULT NULL
)
RETURNS TABLE (id text, "orderNumber" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile     "Profile"%ROWTYPE;
  v_product     "Product"%ROWTYPE;
  v_party       "Party"%ROWTYPE;
  v_fy_start    int;
  v_fy_end      int;
  v_fy_label    text;
  v_prefix      text;
  v_count       int;
  v_number      text;
  v_id          text;
  v_rate_num    numeric;
  v_value       numeric;
  v_new_name    text;
  v_new_product text;
  v_prod_brand  text;
BEGIN
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_profile."isActive" = false THEN
    RAISE EXCEPTION 'Account disabled';
  END IF;
  IF v_profile.role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only STAFF or ADMIN may create sales orders';
  END IF;

  v_new_name    := NULLIF(btrim(p_new_customer_name), '');
  v_new_product := NULLIF(btrim(p_new_product_name), '');

  IF (p_party_id IS NULL OR p_party_id = '') AND v_new_name IS NULL THEN
    RAISE EXCEPTION 'Provide either an existing customer or a new customer name';
  END IF;
  IF (p_party_id IS NOT NULL AND p_party_id <> '') AND v_new_name IS NOT NULL THEN
    RAISE EXCEPTION 'Provide only one of party_id or new_customer_name';
  END IF;

  IF (p_product_id IS NULL OR p_product_id = '') AND v_new_product IS NULL THEN
    RAISE EXCEPTION 'Provide either an existing product or a new product name';
  END IF;
  IF (p_product_id IS NOT NULL AND p_product_id <> '') AND v_new_product IS NOT NULL THEN
    RAISE EXCEPTION 'Provide only one of product_id or new_product_name';
  END IF;

  IF p_party_id IS NOT NULL AND p_party_id <> '' THEN
    SELECT * INTO v_party FROM "Party" WHERE id = p_party_id;
    IF v_party.id IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_profile.role = 'STAFF'
       AND v_party."assignedToId" IS NOT NULL
       AND v_party."assignedToId" <> v_profile.id THEN
      RAISE EXCEPTION 'This customer is assigned to another salesperson';
    END IF;
  END IF;

  IF p_product_id IS NOT NULL AND p_product_id <> '' THEN
    SELECT * INTO v_product FROM "Product" WHERE id = p_product_id;
    IF v_product.id IS NULL OR v_product."isActive" = false THEN
      RAISE EXCEPTION 'Selected product is unavailable';
    END IF;
  ELSE
    v_prod_brand := COALESCE(NULLIF(btrim(p_brand), ''), 'CUSTOM');
    SELECT * INTO v_product
    FROM "Product"
    WHERE lower(name) = lower(v_new_product)
      AND lower(brand) = lower(v_prod_brand)
      AND "isActive" = true
    ORDER BY "createdAt" ASC
    LIMIT 1;
    IF v_product.id IS NULL THEN
      INSERT INTO "Product" (id, name, brand, "isActive", "sortOrder", "createdAt")
      VALUES (
        replace(gen_random_uuid()::text, '-', ''),
        v_new_product,
        v_prod_brand,
        true,
        9999,
        now()
      )
      RETURNING * INTO v_product;
    END IF;
  END IF;

  v_rate_num := COALESCE(
    NULLIF(regexp_replace(p_product_rate, '[^0-9.\-]', '', 'g'), '')::numeric,
    0
  );
  v_value := round(p_quantity * v_rate_num, 2);

  IF EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN
    v_fy_start := EXTRACT(YEAR FROM CURRENT_DATE)::int % 100;
  ELSE
    v_fy_start := (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) % 100;
  END IF;
  v_fy_end := v_fy_start + 1;
  v_fy_label := lpad(v_fy_start::text, 2, '0') || '-' || lpad(v_fy_end::text, 2, '0');
  v_prefix := 'SB/' || v_fy_label || '/';

  PERFORM pg_advisory_xact_lock(hashtext(v_prefix));

  SELECT count(*) INTO v_count
  FROM "SalesOrder"
  WHERE "orderNumber" LIKE v_prefix || '%';

  v_number := v_prefix || lpad((v_count + 1)::text, 4, '0');
  v_id := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO "SalesOrder" (
    id, "orderNumber", "partyId", "newCustomerName",
    "salespersonId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "orderValue",
    "paymentTerm", "transportType", "expectedDeliveryDate",
    "dispatchLocation", "tokenType",
    notes, "currentStatus", "creditCheckPassed",
    "createdAt", "updatedAt"
  ) VALUES (
    v_id, v_number,
    NULLIF(p_party_id, ''),
    v_new_name,
    v_profile.id, v_product.id, COALESCE(p_brand, v_product.brand),
    p_quantity, p_quantity_unit, p_packing_type, p_size_kg,
    p_product_rate, v_value,
    p_payment_term, p_transport_type, p_expected_delivery_date,
    NULLIF(btrim(p_dispatch_location), ''),
    NULLIF(btrim(p_token_type), ''),
    NULLIF(btrim(p_notes), ''), 'ORDER_PLACED', true,
    now(), now()
  );

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_id, 'ORDER_PLACED', 'Order placed', v_profile.id, now()
  );

  RETURN QUERY SELECT v_id, v_number;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Trigger: clear PushToken rows the moment isActive flips to false.
-- Belt-and-braces on top of the RLS tightening: the tightened policy
-- prevents future writes; the trigger clears past ones so no more
-- pushes go to a deactivated user's device even if it stays online.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._profile_after_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."isActive" = true
     AND NEW."isActive" = false THEN
    DELETE FROM "PushToken" WHERE "profileId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_after_deactivate ON "Profile";
CREATE TRIGGER trg_profile_after_deactivate
  AFTER UPDATE OF "isActive" ON "Profile"
  FOR EACH ROW EXECUTE FUNCTION public._profile_after_deactivate();

-- ─────────────────────────────────────────────────────────────────
-- Guardrail trigger: refuse to strand the system without an active
-- ADMIN. Blocks both "deactivate the last active ADMIN" and
-- "demote the last active ADMIN". Runs BEFORE UPDATE so the offending
-- write never lands.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._profile_guard_last_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_other_active_admins int;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  IF OLD.role = 'ADMIN' AND OLD."isActive" = true
     AND (
       (NEW."isActive" = false)
       OR (NEW.role IS DISTINCT FROM 'ADMIN')
     )
  THEN
    SELECT count(*) INTO v_other_active_admins
    FROM "Profile"
    WHERE id <> OLD.id
      AND role = 'ADMIN'
      AND "isActive" = true;
    IF v_other_active_admins = 0 THEN
      RAISE EXCEPTION
        'Refusing to leave the system without an active ADMIN'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_guard_last_admin ON "Profile";
CREATE TRIGGER trg_profile_guard_last_admin
  BEFORE UPDATE ON "Profile"
  FOR EACH ROW EXECUTE FUNCTION public._profile_guard_last_admin();
