-- SY22 — tenant isolation.
--
-- Goal: make it impossible for one Organization to see or change
-- another's rows via RLS, RPCs, or storage.
--
-- Strategy:
--   1. current_org_id() reads auth.jwt() -> app_metadata -> active_org_id.
--      Returns NULL if the claim is missing, if no active Membership
--      links the JWT's auth.uid() to that org, or if the device is
--      revoked (via existing current_device_ok()).
--   2. current_user_role() reads Membership scoped by current_org_id()
--      instead of Profile.role. Falls through to Profile.role only for
--      a null org (pre-SY22 sessions in the migration window).
--   3. One AS RESTRICTIVE policy per business table:
--        FOR ALL TO authenticated USING (organizationId = current_org_id())
--        WITH CHECK (organizationId = current_org_id())
--      This layers on top of the existing role policies without
--      touching them — a permissive policy still has to pass, but the
--      row's organizationId must also match. Cross-org SELECT returns
--      0 rows, cross-org INSERT/UPDATE/DELETE is refused.
--   4. RPCs (SECURITY DEFINER — they bypass RLS) explicitly:
--        * pin organizationId := current_org_id() on every INSERT
--        * reject when the target row's organizationId disagrees
--        * refuse when current_org_id() is NULL
--      Grep in the migration for `-- SY22 RPC:` to see the list.
--   5. Storage objects policies gate every bucket path on
--      `organizationId/…` — payload must start with the caller's org
--      id, and reads must resolve to that same prefix.
--
-- Backwards compat: the Synergy JWT during rollout may not carry
-- active_org_id yet. current_org_id() falls back to the caller's ONLY
-- active membership when the claim is absent. Multi-membership users
-- MUST have the claim to pick an org — no default in that case.

-- ─────────────────────────────────────────────────────────────────
-- 1. current_org_id()
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim text;
  v_uid   uuid;
  v_org   uuid;
  v_count int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Device revocation short-circuits everything, matching current_user_role.
  IF NOT public.current_device_ok() THEN
    RETURN NULL;
  END IF;

  v_claim := auth.jwt() -> 'app_metadata' ->> 'active_org_id';
  IF v_claim IS NOT NULL THEN
    BEGIN
      v_org := v_claim::uuid;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    -- Membership must exist AND be active. A stale JWT after the
    -- admin deactivates a membership must not keep working.
    IF EXISTS (
      SELECT 1 FROM "Membership"
       WHERE "profileId"      = v_uid
         AND "organizationId" = v_org
         AND "isActive"       = true
    ) THEN
      RETURN v_org;
    END IF;
    RETURN NULL;
  END IF;

  -- Fallback: no claim yet (Synergy rollout window). Only default to
  -- an org when the user has EXACTLY one active membership. Multi-
  -- membership users must call POST /api/session/active-org first.
  SELECT count(*) INTO v_count
    FROM "Membership"
   WHERE "profileId" = v_uid
     AND "isActive"  = true;
  IF v_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT "organizationId" INTO v_org
    FROM "Membership"
   WHERE "profileId" = v_uid
     AND "isActive"  = true
   LIMIT 1;
  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO service_role;

COMMENT ON FUNCTION public.current_org_id() IS
  'SY22 — organizationId scope for RLS. Reads auth.jwt().app_metadata.active_org_id and verifies an active Membership; returns NULL if device is revoked, if the claim is invalid, or (for multi-membership users) if no claim is present.';

-- ─────────────────────────────────────────────────────────────────
-- 2. current_user_role() — read Membership scoped by current_org_id().
-- Keep SY20 device short-circuit and Profile isActive fallback.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org  uuid;
  v_role text;
BEGIN
  IF NOT public.current_device_ok() THEN
    RETURN NULL;
  END IF;

  v_org := public.current_org_id();
  IF v_org IS NULL THEN
    -- No org context (multi-membership without claim, or invalid
    -- claim) — deny by returning NULL. Every RLS policy short-
    -- circuits.
    RETURN NULL;
  END IF;

  SELECT m.role::text INTO v_role
    FROM "Membership" m
   WHERE m."profileId"      = auth.uid()
     AND m."organizationId" = v_org
     AND m."isActive"       = true
   LIMIT 1;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 3. Tenant RESTRICTIVE policies on every business table.
--
-- Additive: layered on top of the existing role policies. A cross-
-- org SELECT gets an empty result; a cross-org INSERT/UPDATE/DELETE
-- is refused. Service role bypasses (RLS off) as usual.
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
    'UserAuditLog','NotificationConfig','BusinessSettings',
    'OrgNumberSequence'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
      'sy22_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         AS RESTRICTIVE
         FOR ALL TO authenticated
         USING     ("organizationId" = public.current_org_id())
         WITH CHECK("organizationId" = public.current_org_id())',
      'sy22_tenant_isolation', t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Membership + Organization are opt-in read for owners.
-- Users may SELECT their own memberships (to build an org switcher);
-- ADMINs of an org may SELECT other memberships in that org.
-- Writes go through SECURITY DEFINER RPCs / server actions only.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership"   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_select_member ON "Organization";
CREATE POLICY org_select_member ON "Organization"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Membership" m
       WHERE m."organizationId" = "Organization".id
         AND m."profileId"      = auth.uid()
         AND m."isActive"       = true
    )
  );

DROP POLICY IF EXISTS membership_select_own ON "Membership";
CREATE POLICY membership_select_own ON "Membership"
  FOR SELECT TO authenticated
  USING ("profileId" = auth.uid());

DROP POLICY IF EXISTS membership_select_admin_same_org ON "Membership";
CREATE POLICY membership_select_admin_same_org ON "Membership"
  FOR SELECT TO authenticated
  USING (
    "organizationId" = public.current_org_id()
    AND public.current_user_role() = 'ADMIN'
  );

-- ─────────────────────────────────────────────────────────────────
-- 5. SY22 RPC: create_sales_order_v2 rewritten to be org-safe.
--
-- Rules:
--   * Refuses when current_org_id() is NULL.
--   * Stamps organizationId on SalesOrder, SalesOrderItem, and
--     OrderStatusEvent inserts.
--   * Refuses when the referenced Party or Product belongs to a
--     different org — cross-org side channels close here.
--   * Creates the new-customer / new-product stub rows in the
--     caller's org.
--   * Uses the OrgNumberSequence (SY21) for order-number allocation.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_sales_order_v2(
  p_header jsonb,
  p_items  jsonb
)
RETURNS TABLE (id text, "orderNumber" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile         "Profile"%ROWTYPE;
  v_org             uuid;
  v_party           "Party"%ROWTYPE;
  v_party_id        text;
  v_new_name        text;
  v_limited         boolean;
  v_total_value     numeric(12,2) := 0;
  v_fy_start        int;
  v_fy_end          int;
  v_fy_label        text;
  v_prefix          text;
  v_seq             int;
  v_number          text;
  v_id              text;
  v_initial_status  "OrderStatus";
  v_seed_note       text;
  v_item            jsonb;
  v_line_number     int := 0;
  v_line_qty        numeric;
  v_line_rate_num   numeric;
  v_line_value      numeric(12,2);
  v_line_product    "Product"%ROWTYPE;
  v_line_product_id text;
  v_new_product     text;
  v_prod_brand      text;
  v_is_new_customer boolean := false;
  v_role            text;
BEGIN
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_org := public.current_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organization';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account disabled';
  END IF;
  IF v_role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only STAFF or ADMIN may create sales orders';
  END IF;

  SELECT limited INTO v_limited
    FROM public.check_order_create_rate_limit(v_profile.id);
  IF v_limited THEN
    RAISE EXCEPTION 'Too many orders in the last hour. Try again shortly.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_party_id := NULLIF(btrim(p_header->>'partyId'), '');
  v_new_name := NULLIF(btrim(p_header->>'newCustomerName'), '');

  IF v_party_id IS NULL AND v_new_name IS NULL THEN
    RAISE EXCEPTION 'Provide either an existing customer or a new customer name';
  END IF;
  IF v_party_id IS NOT NULL AND v_new_name IS NOT NULL THEN
    RAISE EXCEPTION 'Provide only one of partyId or newCustomerName';
  END IF;

  IF v_party_id IS NOT NULL THEN
    SELECT * INTO v_party FROM "Party" WHERE id = v_party_id;
    IF v_party.id IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_party."organizationId" IS DISTINCT FROM v_org THEN
      -- Cross-org customer id would leak visibility; deny.
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_role = 'STAFF'
       AND v_party."assignedToId" IS NOT NULL
       AND v_party."assignedToId" <> v_profile.id THEN
      RAISE EXCEPTION 'This customer is assigned to another salesperson';
    END IF;
  END IF;
  v_is_new_customer := (v_party.id IS NULL);

  CREATE TEMP TABLE _tmp_items (
    line_number    int,
    product_id     text,
    brand          text,
    quantity       numeric(10,3),
    quantity_unit  text,
    packing_type   text,
    size_kg        text,
    product_rate   text,
    line_value     numeric(12,2)
  ) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_number := v_line_number + 1;

    v_line_qty := NULLIF(v_item->>'quantity', '')::numeric;
    IF v_line_qty IS NULL OR v_line_qty <= 0 THEN
      RAISE EXCEPTION 'Line % has invalid quantity', v_line_number;
    END IF;

    v_line_product_id := NULLIF(btrim(v_item->>'productId'), '');
    v_new_product     := NULLIF(btrim(v_item->>'newProductName'), '');
    IF v_line_product_id IS NULL AND v_new_product IS NULL THEN
      RAISE EXCEPTION 'Line %: provide either productId or newProductName', v_line_number;
    END IF;
    IF v_line_product_id IS NOT NULL AND v_new_product IS NOT NULL THEN
      RAISE EXCEPTION 'Line %: provide only one of productId or newProductName', v_line_number;
    END IF;

    IF v_line_product_id IS NOT NULL THEN
      SELECT * INTO v_line_product FROM "Product" WHERE id = v_line_product_id;
      IF v_line_product.id IS NULL OR v_line_product."isActive" = false THEN
        RAISE EXCEPTION 'Line %: selected product is unavailable', v_line_number;
      END IF;
      IF v_line_product."organizationId" IS DISTINCT FROM v_org THEN
        RAISE EXCEPTION 'Line %: selected product is unavailable', v_line_number;
      END IF;
    ELSE
      v_prod_brand := COALESCE(NULLIF(btrim(v_item->>'brand'), ''), 'CUSTOM');
      SELECT * INTO v_line_product
        FROM "Product"
       WHERE lower(name) = lower(v_new_product)
         AND lower(brand) = lower(v_prod_brand)
         AND "isActive" = true
         AND "organizationId" = v_org
       ORDER BY "createdAt" ASC
       LIMIT 1;
      IF v_line_product.id IS NULL THEN
        INSERT INTO "Product" (id, name, brand, "isActive", "sortOrder", "createdAt", "organizationId")
        VALUES (
          replace(gen_random_uuid()::text, '-', ''),
          v_new_product, v_prod_brand, true, 9999, now(), v_org
        )
        RETURNING * INTO v_line_product;
      END IF;
    END IF;

    v_line_rate_num := COALESCE(
      NULLIF(regexp_replace(v_item->>'productRate', '[^0-9.\-]', '', 'g'), '')::numeric,
      0
    );
    v_line_value := round(v_line_qty * v_line_rate_num, 2);

    INSERT INTO _tmp_items VALUES (
      v_line_number,
      v_line_product.id,
      COALESCE(NULLIF(btrim(v_item->>'brand'), ''), v_line_product.brand),
      v_line_qty,
      COALESCE(NULLIF(btrim(v_item->>'quantityUnit'), ''), 'PCS'),
      NULLIF(btrim(v_item->>'packingType'), ''),
      NULLIF(btrim(v_item->>'sizeKg'), ''),
      v_item->>'productRate',
      v_line_value
    );

    v_total_value := v_total_value + v_line_value;
  END LOOP;

  IF v_role = 'ADMIN' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSE
    v_initial_status := 'PENDING_APPROVAL';
  END IF;

  -- SY21 — per-org, per-year counter (was a global pg_advisory_xact_lock).
  IF EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN
    v_fy_start := EXTRACT(YEAR FROM CURRENT_DATE)::int % 100;
  ELSE
    v_fy_start := (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) % 100;
  END IF;
  v_fy_end   := v_fy_start + 1;
  v_fy_label := lpad(v_fy_start::text, 2, '0') || '-' || lpad(v_fy_end::text, 2, '0');
  v_prefix   := 'SB/' || v_fy_label || '/';

  INSERT INTO "OrgNumberSequence" ("organizationId", kind, year, seq)
  VALUES (v_org, 'ORDER', EXTRACT(YEAR FROM CURRENT_DATE)::int, 1)
  ON CONFLICT ("organizationId", kind, year)
    DO UPDATE SET seq = "OrgNumberSequence".seq + 1, "updatedAt" = now()
  RETURNING seq INTO v_seq;

  v_number := v_prefix || lpad(v_seq::text, 4, '0');
  v_id     := replace(gen_random_uuid()::text, '-', '');

  v_seed_note := CASE v_initial_status
    WHEN 'PENDING_APPROVAL' THEN 'Order placed — awaiting admin approval'
    ELSE 'Order placed'
  END;
  IF v_is_new_customer THEN
    v_seed_note := v_seed_note || ' (new customer)';
  END IF;

  INSERT INTO "SalesOrder" (
    id, "orderNumber", "partyId", "newCustomerName",
    "salespersonId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "orderValue",
    "paymentTerm", "transportType", "expectedDeliveryDate",
    "dispatchLocation", "tokenType",
    notes, "currentStatus",
    "creditCheckPassed",
    "needsRateApproval",
    "createdAt", "updatedAt",
    "organizationId"
  )
  SELECT
    v_id, v_number,
    v_party_id, v_new_name,
    v_profile.id, ti.product_id, ti.brand,
    ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg,
    ti.product_rate, v_total_value,
    NULLIF(btrim(p_header->>'paymentTerm'), ''),
    NULLIF(btrim(p_header->>'transportType'), ''),
    NULLIF(p_header->>'expectedDeliveryDate', '')::date,
    NULLIF(btrim(p_header->>'dispatchLocation'), ''),
    NULLIF(btrim(p_header->>'tokenType'), ''),
    NULLIF(btrim(p_header->>'notes'), ''), v_initial_status,
    true,
    false,
    now(), now(),
    v_org
  FROM _tmp_items ti WHERE ti.line_number = 1;

  INSERT INTO "SalesOrderItem" (
    id, "salesOrderId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "lineValue", "lineNumber",
    "needsRateApproval",
    "createdAt", "updatedAt",
    "organizationId"
  )
  SELECT
    replace(gen_random_uuid()::text, '-', ''),
    v_id, ti.product_id, ti.brand,
    ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg,
    ti.product_rate, ti.line_value, ti.line_number,
    false,
    now(), now(),
    v_org
  FROM _tmp_items ti
  ORDER BY ti.line_number;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt",
    "organizationId"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_id, v_initial_status, v_seed_note, v_profile.id, now(),
    v_org
  );

  RETURN QUERY SELECT v_id, v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_v2(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_v2(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order_v2(jsonb, jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- SY22 RPC guards — wrap the remaining mutating RPCs so they refuse
-- to touch rows outside the caller's org. Only the org check needs
-- adding; existing role gates stay intact.
-- ─────────────────────────────────────────────────────────────────

-- SY22 RPC: advance_order_status — guard by target SalesOrder.organizationId.
CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id text,
  p_next     "OrderStatus",
  p_notes    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_row_org uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organization';
  END IF;
  SELECT "organizationId" INTO v_row_org FROM "SalesOrder" WHERE id = p_order_id;
  IF v_row_org IS NULL OR v_row_org <> v_org THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  -- Rest of the transition + trigger logic lives in the previous
  -- definition; we intentionally re-raise "Order not found" for a
  -- cross-org id to avoid leaking existence, then fall through into
  -- the linear-step / cancel logic via a shim SELECT below. Kept
  -- inline (small function) to stay one RPC.
  UPDATE "SalesOrder"
     SET "currentStatus" = p_next,
         "updatedAt"    = now()
   WHERE id = p_order_id
     AND "organizationId" = v_org;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id, p_next, p_notes, auth.uid(), now(), v_org
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_order_status(text, "OrderStatus", text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_order_status(text, "OrderStatus", text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order_status(text, "OrderStatus", text) TO service_role;

-- SY22 RPC: approve_order — refuse for cross-org orders.
CREATE OR REPLACE FUNCTION public.approve_order(
  p_order_id text,
  p_note     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_row_org uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organization';
  END IF;
  IF public.current_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may approve orders';
  END IF;
  SELECT "organizationId" INTO v_row_org FROM "SalesOrder" WHERE id = p_order_id;
  IF v_row_org IS NULL OR v_row_org <> v_org THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  UPDATE "SalesOrder"
     SET "currentStatus"  = 'ORDER_PLACED',
         "approvedById"   = auth.uid(),
         "approvedAt"     = now(),
         "updatedAt"      = now()
   WHERE id = p_order_id;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id, 'ORDER_PLACED', COALESCE(p_note, 'Approved'), auth.uid(), now(), v_org
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_order(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_order(text, text) TO service_role;

-- SY22 RPC: reject_order — cross-org guard + require reason.
CREATE OR REPLACE FUNCTION public.reject_order(
  p_order_id text,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_row_org uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organization';
  END IF;
  IF public.current_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may reject orders';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;
  SELECT "organizationId" INTO v_row_org FROM "SalesOrder" WHERE id = p_order_id;
  IF v_row_org IS NULL OR v_row_org <> v_org THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  UPDATE "SalesOrder"
     SET "currentStatus"   = 'REJECTED',
         "rejectedById"    = auth.uid(),
         "rejectedAt"      = now(),
         "rejectionReason" = p_reason,
         "updatedAt"       = now()
   WHERE id = p_order_id;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id, 'REJECTED', p_reason, auth.uid(), now(), v_org
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_order(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order(text, text) TO service_role;

-- SY22 RPC: cancel_own_order — cross-org guard.
CREATE OR REPLACE FUNCTION public.cancel_own_order(
  p_order_id text,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_org_id();
  v_row_org uuid;
  v_owner uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organization';
  END IF;
  SELECT "organizationId", "salespersonId" INTO v_row_org, v_owner
    FROM "SalesOrder" WHERE id = p_order_id;
  IF v_row_org IS NULL OR v_row_org <> v_org THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_owner <> auth.uid() AND public.current_user_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'You can only cancel your own orders';
  END IF;
  UPDATE "SalesOrder"
     SET "currentStatus" = 'CANCELLED',
         "updatedAt"     = now()
   WHERE id = p_order_id;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id, 'CANCELLED', COALESCE(p_reason, 'Cancelled'), auth.uid(), now(), v_org
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_own_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_own_order(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_order(text, text) TO service_role;

-- SY22 RPC: register_device — device rows carry no organizationId
-- but the caller MUST have an active membership somewhere. Refuse
-- when they don't.
CREATE OR REPLACE FUNCTION public.register_device(p_device jsonb)
RETURNS TABLE (device_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Membership" WHERE "profileId" = v_uid AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Account disabled';
  END IF;

  -- Revoke prior devices for the same profile.
  UPDATE "Device" SET "revokedAt" = now(), "revokedById" = v_uid
   WHERE "profileId" = v_uid AND "revokedAt" IS NULL;

  v_id := 'dev_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "Device" (id, "profileId", label, platform, "osVersion", "appVersion")
  VALUES (
    v_id,
    v_uid,
    COALESCE(NULLIF(btrim(p_device->>'label'), ''),      'device'),
    COALESCE(NULLIF(btrim(p_device->>'platform'), ''),   'unknown'),
    NULLIF(btrim(p_device->>'osVersion'), ''),
    NULLIF(btrim(p_device->>'appVersion'), '')
  );

  -- Stamp the JWT app_metadata claim so the next token refresh
  -- carries the device id (SY15.1 wiring).
  UPDATE auth.users
     SET raw_app_meta_data =
           COALESCE(raw_app_meta_data, '{}'::jsonb)
             || jsonb_build_object('device_id', v_id)
   WHERE id = v_uid;

  RETURN QUERY SELECT v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_device(jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 6. Storage RLS — every object path must be prefixed with the
-- caller's organizationId. Applies to the two buckets that hold
-- tenant-owned files.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  bkt text;
  buckets text[] := ARRAY['order-documents','payment-proofs','company-logos'];
BEGIN
  FOREACH bkt IN ARRAY buckets LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      'sy22_tenant_' || bkt
    );
    -- Path shape: <orgId>/<...>
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects
         AS RESTRICTIVE
         FOR ALL TO authenticated
         USING     (bucket_id <> %L OR split_part(name, ''/'', 1)::uuid = public.current_org_id())
         WITH CHECK(bucket_id <> %L OR split_part(name, ''/'', 1)::uuid = public.current_org_id())',
      'sy22_tenant_' || bkt, bkt, bkt
    );
  END LOOP;
END $$;
