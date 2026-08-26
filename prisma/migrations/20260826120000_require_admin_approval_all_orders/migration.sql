-- require_admin_approval_all_orders
--
-- Business rule (two halves, don't conflate them):
--
--   VISIBILITY: every FACTORY user can SEE every order the moment
--   a salesperson places it, including PENDING_APPROVAL and
--   REJECTED rows. No order is ever hidden from the shop floor —
--   they need to know what's in the pipeline.
--
--   ACTION:     the FACTORY may only ADVANCE an order once an admin
--   has approved it (PENDING_APPROVAL → ORDER_PLACED via
--   approveOrderAction). REJECTED and PENDING_APPROVAL rows show
--   up in the factory queue but any advance attempt is refused.
--
-- ADMIN placements continue to skip the approval queue (admin has
-- already reviewed at placement time).
--
-- What this migration changes:
--   1. FACTORY SELECT policies loosened to role-only — no more
--      status / needsRateApproval predicates. Factory sees
--      everything.
--   2. FACTORY UPDATE policy + enforce_factory_sales_order_update
--      trigger + advance_order_status RPC continue to refuse writes
--      on PENDING_APPROVAL / REJECTED. Belt + braces (RLS + trigger
--      + RPC) — the write gate stays intact.
--   3. BusinessSettings.orderApprovalMode default → 'ALL' and every
--      existing row forced to 'ALL' so no distributor is left on
--      the old EXCEPTIONS_ONLY policy.
--   4. create_sales_order_v2 rewritten: every STAFF order lands in
--      PENDING_APPROVAL unconditionally; ADMIN placements go
--      straight to ORDER_PLACED. Floor-rate check and credit-limit
--      gate removed — with mode=ALL the director sees every order
--      at the approval step, so those exception routes are noise.
--
-- Preserved inside create_sales_order_v2: auth (isActive + role),
-- rate limit, party ownership, product / new-product resolution,
-- pg_advisory_xact_lock on the order-number prefix. Those are
-- correctness / abuse controls, not business policy.

-- ─────────────────────────────────────────────────────────────────
-- (A) FACTORY SELECT: role only. Every order shows up, PENDING and
-- REJECTED included, so factory has full pipeline visibility.
-- The UPDATE policy stays strict (see below) — visibility ≠ action.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS sales_order_select_factory ON "SalesOrder";
DROP POLICY IF EXISTS sales_order_update_factory ON "SalesOrder";

CREATE POLICY sales_order_select_factory ON "SalesOrder"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'FACTORY');

-- Write gate stays: RLS still refuses UPDATE on PENDING_APPROVAL /
-- REJECTED / needsRateApproval rows. The enforce trigger below is a
-- second layer that also blocks any field FACTORY isn't allowed to
-- touch, on any status.
CREATE POLICY sales_order_update_factory ON "SalesOrder"
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'FACTORY'
    AND "needsRateApproval" = false
    AND "currentStatus" NOT IN ('PENDING_APPROVAL', 'REJECTED')
  )
  WITH CHECK (
    public.current_user_role() = 'FACTORY'
    AND "needsRateApproval" = false
    AND "currentStatus" NOT IN ('PENDING_APPROVAL', 'REJECTED')
  );

-- Related tables follow the SELECT policy — if factory can see the
-- order, it can see its events and documents. Same "role + parent
-- exists" shape as STAFF's variants.
DROP POLICY IF EXISTS order_status_event_select_factory ON "OrderStatusEvent";
CREATE POLICY order_status_event_select_factory ON "OrderStatusEvent"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'FACTORY'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderStatusEvent"."salesOrderId"
    )
  );

DROP POLICY IF EXISTS order_document_select_factory ON "OrderDocument";
CREATE POLICY order_document_select_factory ON "OrderDocument"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'FACTORY'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderDocument"."salesOrderId"
    )
  );

-- enforce_factory_sales_order_update, advance_order_status, and the
-- approveOrderAction / rejectOrderAction server actions are LEFT
-- UNTOUCHED. Their existing PENDING_APPROVAL / REJECTED refusals are
-- exactly the action gate this feature depends on.

-- ─────────────────────────────────────────────────────────────────
-- (B) Approval mode: ALL, everywhere.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "BusinessSettings"
  ALTER COLUMN "orderApprovalMode" SET DEFAULT 'ALL';

UPDATE "BusinessSettings"
   SET "orderApprovalMode" = 'ALL'
 WHERE "orderApprovalMode" <> 'ALL';

-- ─────────────────────────────────────────────────────────────────
-- (C) create_sales_order_v2 — every STAFF order → PENDING_APPROVAL.
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
  v_party           "Party"%ROWTYPE;
  v_party_id        text;
  v_new_name        text;
  v_limited         boolean;
  v_total_value     numeric(12,2) := 0;
  v_fy_start        int;
  v_fy_end          int;
  v_fy_label        text;
  v_prefix          text;
  v_count           int;
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
BEGIN
  -- Auth
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

  -- Per-user hourly abuse cap
  SELECT limited INTO v_limited
  FROM public.check_order_create_rate_limit(v_profile.id);
  IF v_limited THEN
    RAISE EXCEPTION 'Too many orders in the last hour. Try again shortly.';
  END IF;

  -- Header shape
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
    IF v_profile.role = 'STAFF'
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
    ELSE
      v_prod_brand := COALESCE(NULLIF(btrim(v_item->>'brand'), ''), 'CUSTOM');
      SELECT * INTO v_line_product
      FROM "Product"
      WHERE lower(name) = lower(v_new_product)
        AND lower(brand) = lower(v_prod_brand)
        AND "isActive" = true
      ORDER BY "createdAt" ASC
      LIMIT 1;
      IF v_line_product.id IS NULL THEN
        INSERT INTO "Product" (id, name, brand, "isActive", "sortOrder", "createdAt")
        VALUES (
          replace(gen_random_uuid()::text, '-', ''),
          v_new_product, v_prod_brand, true, 9999, now()
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

  -- Routing: STAFF always awaits admin approval; ADMIN self-approves
  -- at placement. We do not read BusinessSettings.orderApprovalMode
  -- here — the mode column is retained for reporting only, and this
  -- migration forces it to ALL. If a future distributor wants a
  -- different policy, they change this RPC.
  IF v_profile.role = 'ADMIN' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSE
    v_initial_status := 'PENDING_APPROVAL';
  END IF;

  -- Order-number allocation: ONE lock, ONE number.
  IF EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN
    v_fy_start := EXTRACT(YEAR FROM CURRENT_DATE)::int % 100;
  ELSE
    v_fy_start := (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) % 100;
  END IF;
  v_fy_end   := v_fy_start + 1;
  v_fy_label := lpad(v_fy_start::text, 2, '0') || '-' || lpad(v_fy_end::text, 2, '0');
  v_prefix   := 'SB/' || v_fy_label || '/';

  PERFORM pg_advisory_xact_lock(hashtext(v_prefix));

  SELECT COALESCE(
    MAX(NULLIF(substring("orderNumber" FROM (length(v_prefix) + 1)), '')::int),
    0
  )
    INTO v_count
    FROM "SalesOrder"
   WHERE "orderNumber" LIKE v_prefix || '%';

  v_number := v_prefix || lpad((v_count + 1)::text, 4, '0');
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
    "createdAt", "updatedAt"
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
    now(), now()
  FROM _tmp_items ti WHERE ti.line_number = 1;

  INSERT INTO "SalesOrderItem" (
    id, "salesOrderId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "lineValue", "lineNumber",
    "needsRateApproval",
    "createdAt", "updatedAt"
  )
  SELECT
    replace(gen_random_uuid()::text, '-', ''),
    v_id, ti.product_id, ti.brand,
    ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg,
    ti.product_rate, ti.line_value, ti.line_number,
    false,
    now(), now()
  FROM _tmp_items ti
  ORDER BY ti.line_number;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_id, v_initial_status, v_seed_note, v_profile.id, now()
  );

  RETURN QUERY SELECT v_id, v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_v2(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sales_order_v2(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order_v2(jsonb, jsonb) TO service_role;
