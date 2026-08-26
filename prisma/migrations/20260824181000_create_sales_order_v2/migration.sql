-- create_sales_order_v2
--
-- Multi-line variant of create_sales_order. v1 is left in place so the
-- current mobile build keeps working during rollout — do NOT edit or
-- drop the v1 function in this migration.
--
-- Signature:
--   create_sales_order_v2(p_header jsonb, p_items jsonb) RETURNS (id, orderNumber)
--
-- p_header shape:
--   {
--     partyId?: text, newCustomerName?: text,
--     paymentTerm?, transportType?, expectedDeliveryDate?, tokenType?,
--     dispatchLocation?, notes?, creditOverrideNote?
--   }
--
-- p_items shape (JSON array, order = lineNumber 1..N):
--   [{ productId?: text, newProductName?: text,
--      brand: text, quantity: numeric, quantityUnit: text,
--      packingType?: text, sizeKg?: text, productRate: text }]
--
-- Gates preserved from v1 (applied correctly for N lines):
--   - Auth: caller Profile row present, isActive, role IN (STAFF, ADMIN)
--   - Rate-limit RPC (once per submission, not per line)
--   - Party ownership (STAFF must own the party if partyId set)
--   - New-customer stub: allowed via newCustomerName
--   - New-product stub: per-line via newProductName
--   - Floor-rate check: per-line; each below-floor line has
--     needsRateApproval=true; header rolls up via bool_or trigger
--   - Credit-limit check: applied to SUM(lineValue) once
--     - STAFF over-limit + mode=NONE → hard block
--     - STAFF over-limit + mode<>NONE → soft: PENDING_APPROVAL
--     - ADMIN over-limit → override note required, ORDER_PLACED
--   - Order-number generation: ONE pg_advisory_xact_lock, ONE number
--     for the whole multi-line order
--   - ADMIN placements never enter the approval queue; ADMIN below-floor
--     lines self-clear at placement (rateApproved* stamped) so the
--     factory sees the order immediately
--   - Exactly ONE seed OrderStatusEvent for the order
--
-- Returns: (id text, "orderNumber" text)

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
  v_credit_note     text;
  v_limited         boolean;
  v_mode            "OrderApprovalMode";
  v_initial_status  "OrderStatus";
  v_is_new_customer boolean := false;
  v_over_limit      boolean := false;
  v_credit_passed   boolean := true;
  v_override_by     uuid    := NULL;
  v_override_note   text    := NULL;
  v_needs_approv    boolean := false;
  v_total_value     numeric(12,2) := 0;
  v_projected       numeric;
  v_fy_start        int;
  v_fy_end          int;
  v_fy_label        text;
  v_prefix          text;
  v_count           int;
  v_number          text;
  v_id              text;
  v_seed_note       text;
  v_item            jsonb;
  v_line_number     int := 0;
  v_line_qty        numeric;
  v_line_rate_num   numeric;
  v_line_value      numeric(12,2);
  v_line_needs_ap   boolean;
  v_line_ap_by      uuid;
  v_line_ap_at      timestamptz;
  v_line_ap_note    text;
  v_line_product    "Product"%ROWTYPE;
  v_line_product_id text;
  v_new_product     text;
  v_prod_brand      text;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────
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

  -- ── Rate limit ────────────────────────────────────────────────────
  SELECT limited INTO v_limited
  FROM public.check_order_create_rate_limit(v_profile.id);
  IF v_limited THEN
    RAISE EXCEPTION 'Too many orders in the last hour. Try again shortly.';
  END IF;

  -- ── Header validation ────────────────────────────────────────────
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_party_id  := NULLIF(btrim(p_header->>'partyId'), '');
  v_new_name  := NULLIF(btrim(p_header->>'newCustomerName'), '');
  v_credit_note := NULLIF(btrim(p_header->>'creditOverrideNote'), '');

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

  -- ── First pass over items: resolve products, sum values, per-line
  --    floor check. We do NOT insert yet — the credit-limit check
  --    below needs the total, and we still need to allocate the
  --    order number under one advisory lock.
  -- Stash resolved (id, brand, qty, unit, packing, size, rate,
  -- value, needs) per line in a temp table so we don't re-parse.
  CREATE TEMP TABLE _tmp_items (
    line_number       int,
    product_id        text,
    brand             text,
    quantity          numeric(10,3),
    quantity_unit     text,
    packing_type      text,
    size_kg           text,
    product_rate      text,
    line_value        numeric(12,2),
    needs_approval    boolean,
    rate_approved_by  uuid,
    rate_approved_at  timestamptz,
    rate_approval_note text
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

    v_line_needs_ap := false;
    v_line_ap_by    := NULL;
    v_line_ap_at    := NULL;
    v_line_ap_note  := NULL;
    IF v_line_product."floorRate" IS NOT NULL
       AND v_line_rate_num > 0
       AND v_line_rate_num < v_line_product."floorRate" THEN
      v_line_needs_ap := true;
      -- ADMIN self-approves below-floor lines at placement, per line.
      -- The header rollup trigger clears SalesOrder.needsRateApproval
      -- once every line is cleared.
      IF v_profile.role = 'ADMIN' THEN
        v_line_ap_by   := v_profile.id;
        v_line_ap_at   := now();
        v_line_ap_note := 'Self-approved at placement';
        v_line_needs_ap := false;
      END IF;
    END IF;

    IF v_line_needs_ap THEN
      v_needs_approv := true;
    END IF;

    INSERT INTO _tmp_items VALUES (
      v_line_number,
      v_line_product.id,
      COALESCE(NULLIF(btrim(v_item->>'brand'), ''), v_line_product.brand),
      v_line_qty,
      COALESCE(NULLIF(btrim(v_item->>'quantityUnit'), ''), 'PCS'),
      NULLIF(btrim(v_item->>'packingType'), ''),
      NULLIF(btrim(v_item->>'sizeKg'), ''),
      v_item->>'productRate',
      v_line_value,
      v_line_needs_ap,
      v_line_ap_by,
      v_line_ap_at,
      v_line_ap_note
    );

    v_total_value := v_total_value + v_line_value;
  END LOOP;

  -- ── Approval mode + credit check (against total) ─────────────────
  SELECT "orderApprovalMode" INTO v_mode
  FROM "BusinessSettings" LIMIT 1;
  IF v_mode IS NULL THEN v_mode := 'EXCEPTIONS_ONLY'; END IF;

  IF v_party.id IS NOT NULL AND v_party."creditLimit" IS NOT NULL THEN
    v_projected := COALESCE(v_party."totalOutstanding", 0) + v_total_value;
    IF v_projected > v_party."creditLimit" THEN
      v_over_limit := true;
    END IF;
  END IF;

  IF v_over_limit THEN
    IF v_profile.role = 'ADMIN' THEN
      IF v_credit_note IS NULL THEN
        RAISE EXCEPTION
          'Override note required to place this order past the credit limit.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_credit_passed := false;
      v_override_by   := v_profile.id;
      v_override_note := v_credit_note;
    ELSE
      IF v_mode = 'NONE' THEN
        RAISE EXCEPTION
          'Credit limit would be exceeded — ask an admin to review, or collect outstanding first.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_credit_passed := false;
    END IF;
  END IF;

  -- ── Initial status ───────────────────────────────────────────────
  IF v_profile.role = 'ADMIN' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSIF v_mode = 'NONE' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSIF v_mode = 'ALL' THEN
    v_initial_status := 'PENDING_APPROVAL';
  ELSE
    IF v_needs_approv OR v_over_limit OR v_is_new_customer THEN
      v_initial_status := 'PENDING_APPROVAL';
    ELSE
      v_initial_status := 'ORDER_PLACED';
    END IF;
  END IF;

  -- ── Order-number allocation: ONE lock, ONE number ────────────────
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
  IF v_needs_approv THEN
    v_seed_note := v_seed_note || ' (one or more lines below floor rate)';
  END IF;
  IF v_over_limit THEN
    v_seed_note := v_seed_note ||
      CASE WHEN v_profile.role = 'ADMIN'
        THEN ' — credit override by admin: ' || v_override_note
        ELSE ' (over credit limit)'
      END;
  END IF;
  IF v_is_new_customer THEN
    v_seed_note := v_seed_note || ' (new customer)';
  END IF;

  -- ── Insert header with placeholder scalars ───────────────────────
  -- The trigger fires on each item insert and mirrors line 1 back
  -- onto the header. We need the row to exist first for the FK, so
  -- we stuff the scalars with line 1's data up front and let the
  -- trigger re-sync `orderValue` = SUM as remaining lines land.
  INSERT INTO "SalesOrder" (
    id, "orderNumber", "partyId", "newCustomerName",
    "salespersonId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "orderValue",
    "paymentTerm", "transportType", "expectedDeliveryDate",
    "dispatchLocation", "tokenType",
    notes, "currentStatus",
    "creditCheckPassed", "creditOverrideById", "creditOverrideNote",
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
    v_credit_passed, v_override_by, v_override_note,
    v_needs_approv,
    now(), now()
  FROM _tmp_items ti WHERE ti.line_number = 1;

  -- ── Insert every line ────────────────────────────────────────────
  INSERT INTO "SalesOrderItem" (
    id, "salesOrderId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "lineValue", "lineNumber",
    "needsRateApproval", "rateApprovedById", "rateApprovedAt",
    "rateApprovalNote", "createdAt", "updatedAt"
  )
  SELECT
    replace(gen_random_uuid()::text, '-', ''),
    v_id, ti.product_id, ti.brand,
    ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg,
    ti.product_rate, ti.line_value, ti.line_number,
    ti.needs_approval, ti.rate_approved_by, ti.rate_approved_at,
    ti.rate_approval_note, now(), now()
  FROM _tmp_items ti
  ORDER BY ti.line_number;

  -- ── ONE seed event for the whole order ───────────────────────────
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
