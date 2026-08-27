-- sales_order_discount_gst
--
-- Adds cash-discount and GST columns to SalesOrder and teaches
-- create_sales_order_v2 to read them off the header jsonb.
--
-- Money model (rupees, 2 dp) computed and persisted server-side so
-- invoices / Tally exports / any admin reader don't have to redo the
-- arithmetic on top of the deprecated single-SKU orderValue.
--
--   orderValue      = SUM(items.lineValue)                 -- subtotal, pre-discount
--   discountAmount  = round(orderValue    × discountPct/100, 2)
--   taxableAmount   = orderValue − discountAmount
--   gstAmount       = round(taxableAmount × gstPct/100, 2)
--   grandTotal      = taxableAmount + gstAmount
--
-- Defaults: discountPct = 0, gstPct = 18. Existing rows backfill via
-- the DEFAULT (discount = 0, GST = 18%) and a one-time UPDATE that
-- recomputes taxable / gst / grand from the current orderValue so no
-- historical row has a zero grandTotal that would misreport in
-- accounting queries.

ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "discountPct"    numeric(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmount" numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxableAmount"  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "gstPct"         numeric(5,2)  NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS "gstAmount"      numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grandTotal"     numeric(12,2) NOT NULL DEFAULT 0;

-- Backfill: recompute taxable / gst / grand for every existing row so
-- reports don't see a row with orderValue = 5000 but grandTotal = 0.
UPDATE "SalesOrder"
   SET "taxableAmount" = "orderValue",
       "gstAmount"     = round("orderValue" * 18 / 100, 2),
       "grandTotal"    = "orderValue" + round("orderValue" * 18 / 100, 2)
 WHERE "grandTotal" = 0;

-- ─────────────────────────────────────────────────────────────────
-- create_sales_order_v2 — accept + persist discount + GST.
-- All other behaviour (auth, rate-limit, party ownership, product
-- resolution, order-number allocation, status routing, event seed) is
-- preserved verbatim from 20260826120000_require_admin_approval_all_orders.
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
  v_discount_pct    numeric(5,2)  := 0;
  v_discount_amt    numeric(12,2) := 0;
  v_taxable_amt     numeric(12,2) := 0;
  v_gst_pct         numeric(5,2)  := 18;
  v_gst_amt         numeric(12,2) := 0;
  v_grand_total     numeric(12,2) := 0;
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
    IF v_profile.role = 'STAFF'
       AND v_party."assignedToId" IS NOT NULL
       AND v_party."assignedToId" <> v_profile.id THEN
      RAISE EXCEPTION 'This customer is assigned to another salesperson';
    END IF;
  END IF;
  v_is_new_customer := (v_party.id IS NULL);

  -- Pricing tier — clamp to [0, 100]. Missing keys keep the sensible
  -- defaults (0 discount, 18% GST) so a client that pre-dates this
  -- migration still succeeds.
  v_discount_pct := LEAST(GREATEST(
    COALESCE(NULLIF(p_header->>'discountPct', '')::numeric, 0),
    0
  ), 100);
  v_gst_pct := LEAST(GREATEST(
    COALESCE(NULLIF(p_header->>'gstPct', '')::numeric, 18),
    0
  ), 100);

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

  -- Money — same formula the mobile review screen shows.
  v_discount_amt := round(v_total_value * v_discount_pct / 100, 2);
  v_taxable_amt  := round(v_total_value - v_discount_amt, 2);
  v_gst_amt      := round(v_taxable_amt * v_gst_pct / 100, 2);
  v_grand_total  := round(v_taxable_amt + v_gst_amt, 2);

  IF v_profile.role = 'ADMIN' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSE
    v_initial_status := 'PENDING_APPROVAL';
  END IF;

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
    "discountPct", "discountAmount",
    "taxableAmount", "gstPct", "gstAmount", "grandTotal",
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
    v_discount_pct, v_discount_amt,
    v_taxable_amt, v_gst_pct, v_gst_amt, v_grand_total,
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
