-- P0-A — Collapse the dual write path on SalesOrder creation.
--
-- Before: web (createSalesOrderAction, Prisma, bypasses RLS) ran the
-- credit-limit gate but never touched needsRateApproval; the RPC ran
-- the floor-rate check but hardcoded creditCheckPassed=true and
-- ignored Party.creditLimit / totalOutstanding. Web also skipped the
-- rate-limit RPC and the pg_advisory_xact_lock on the order number
-- prefix.
--
-- This migration makes create_sales_order the single source of
-- truth. Adds p_credit_override_note; extends the body with:
--   - credit-limit block (STAFF cannot bypass, ADMIN may bypass only
--     with a non-empty override note)
--   - creditCheckPassed / creditOverrideById / creditOverrideNote
--     stamped correctly on every path
--   - override event text baked into the seed OrderStatusEvent
-- Existing gates preserved: isActive, role, party ownership, rate
-- limit, floor rate, order-number advisory lock, new-customer name.

DROP FUNCTION IF EXISTS public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text, text, text
);

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
  p_new_product_name      text DEFAULT NULL,
  p_credit_override_note  text DEFAULT NULL
)
RETURNS TABLE (id text, "orderNumber" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- The RETURNS TABLE columns (id, orderNumber) shadow same-named
-- columns on Party / Product / SalesOrder inside this body. Tell
-- PLpgSQL to resolve bare identifiers as table columns, not the
-- OUT parameters — otherwise every `WHERE id = ...` raises
-- "column reference 'id' is ambiguous" on PG 15+.
#variable_conflict use_column
DECLARE
  v_profile         "Profile"%ROWTYPE;
  v_product         "Product"%ROWTYPE;
  v_party           "Party"%ROWTYPE;
  v_fy_start        int;
  v_fy_end          int;
  v_fy_label        text;
  v_prefix          text;
  v_count           int;
  v_number          text;
  v_id              text;
  v_rate_num        numeric;
  v_value           numeric;
  v_new_name        text;
  v_new_product     text;
  v_prod_brand      text;
  v_limited         boolean;
  v_needs_approv    boolean := false;
  v_credit_passed   boolean := true;
  v_override_by     uuid    := NULL;
  v_override_note   text    := NULL;
  v_projected       numeric;
  v_seed_note       text;
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

  SELECT limited INTO v_limited
  FROM public.check_order_create_rate_limit(v_profile.id);
  IF v_limited THEN
    RAISE EXCEPTION 'Too many orders in the last hour. Try again shortly.';
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

  -- Below floor → needs admin rate approval (F6). Runs on both paths
  -- now, closing the "silent skip from the web" divergence.
  IF v_product."floorRate" IS NOT NULL
     AND v_rate_num > 0
     AND v_rate_num < v_product."floorRate" THEN
    v_needs_approv := true;
  END IF;

  -- Credit-limit gate. Only meaningful when there IS a party (new-
  -- customer orders have no ledger to check against).
  IF v_party.id IS NOT NULL
     AND v_party."creditLimit" IS NOT NULL THEN
    v_projected := COALESCE(v_party."totalOutstanding", 0) + v_value;
    IF v_projected > v_party."creditLimit" THEN
      IF v_profile.role <> 'ADMIN' THEN
        RAISE EXCEPTION
          'Credit limit would be exceeded — ask an admin to review, or collect outstanding first.'
          USING ERRCODE = 'check_violation';
      END IF;
      -- ADMIN — must supply a non-empty override note. Any other
      -- role would already have raised above.
      IF NULLIF(btrim(p_credit_override_note), '') IS NULL THEN
        RAISE EXCEPTION
          'Override note required to place this order past the credit limit.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_credit_passed := false;
      v_override_by   := v_profile.id;
      v_override_note := btrim(p_credit_override_note);
    END IF;
  END IF;

  IF EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN
    v_fy_start := EXTRACT(YEAR FROM CURRENT_DATE)::int % 100;
  ELSE
    v_fy_start := (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) % 100;
  END IF;
  v_fy_end := v_fy_start + 1;
  v_fy_label := lpad(v_fy_start::text, 2, '0') || '-' || lpad(v_fy_end::text, 2, '0');
  v_prefix := 'SB/' || v_fy_label || '/';

  PERFORM pg_advisory_xact_lock(hashtext(v_prefix));

  -- Use MAX(seq)+1 rather than COUNT+1 so a hole in the sequence
  -- (from a previously cancelled test run or a rare rollback) does
  -- not cause a collision with an existing higher number.
  SELECT COALESCE(
    MAX(
      NULLIF(
        substring("orderNumber" FROM (length(v_prefix) + 1)),
        ''
      )::int
    ),
    0
  ) INTO v_count
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
    notes, "currentStatus",
    "creditCheckPassed", "creditOverrideById", "creditOverrideNote",
    "needsRateApproval",
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
    NULLIF(btrim(p_notes), ''), 'ORDER_PLACED',
    v_credit_passed, v_override_by, v_override_note,
    v_needs_approv,
    now(), now()
  );

  -- Compose the seed event message so downstream readers see credit /
  -- rate context without joining more tables.
  v_seed_note := 'Order placed';
  IF v_needs_approv THEN
    v_seed_note := v_seed_note || ' — awaiting admin rate approval (below floor)';
  END IF;
  IF v_override_by IS NOT NULL THEN
    v_seed_note := v_seed_note || ' — credit override by admin: ' || v_override_note;
  END IF;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_id, 'ORDER_PLACED', v_seed_note, v_profile.id, now()
  );

  RETURN QUERY SELECT v_id, v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text, text, text, text
) TO service_role;
