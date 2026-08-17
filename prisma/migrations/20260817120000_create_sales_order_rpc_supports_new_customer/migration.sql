-- create_sales_order RPC — source of truth.
-- Adds p_new_customer_name so mobile can place orders for customers not
-- yet in the Tally ledger. Either p_party_id OR p_new_customer_name must
-- be supplied. Reconciliation into a real Party happens later via
-- lib/orders/reconcile.ts once Tally sync brings the ledger name in.

DROP FUNCTION IF EXISTS public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text
);
DROP FUNCTION IF EXISTS public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text
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
  p_new_customer_name     text DEFAULT NULL
)
RETURNS TABLE (id text, "orderNumber" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   "Profile"%ROWTYPE;
  v_product   "Product"%ROWTYPE;
  v_party     "Party"%ROWTYPE;
  v_fy_start  int;
  v_fy_end    int;
  v_fy_label  text;
  v_prefix    text;
  v_count     int;
  v_number    text;
  v_id        text;
  v_rate_num  numeric;
  v_value     numeric;
  v_new_name  text;
BEGIN
  -- Auth + role
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_profile.role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only STAFF or ADMIN may create sales orders';
  END IF;

  -- Customer resolution: exactly one of p_party_id / p_new_customer_name
  v_new_name := NULLIF(btrim(p_new_customer_name), '');
  IF (p_party_id IS NULL OR p_party_id = '') AND v_new_name IS NULL THEN
    RAISE EXCEPTION 'Provide either an existing customer or a new customer name';
  END IF;
  IF (p_party_id IS NOT NULL AND p_party_id <> '') AND v_new_name IS NOT NULL THEN
    RAISE EXCEPTION 'Provide only one of party_id or new_customer_name';
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

  -- Product
  SELECT * INTO v_product FROM "Product" WHERE id = p_product_id;
  IF v_product.id IS NULL OR v_product."isActive" = false THEN
    RAISE EXCEPTION 'Selected product is unavailable';
  END IF;

  -- Order value (best-effort rate parse; matches app/actions.ts parseRate)
  v_rate_num := COALESCE(
    NULLIF(regexp_replace(p_product_rate, '[^0-9.\-]', '', 'g'), '')::numeric,
    0
  );
  v_value := round(p_quantity * v_rate_num, 2);

  -- FY label (Indian FY: Apr–Mar → "YY-YY")
  IF EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN
    v_fy_start := EXTRACT(YEAR FROM CURRENT_DATE)::int % 100;
  ELSE
    v_fy_start := (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) % 100;
  END IF;
  v_fy_end := v_fy_start + 1;
  v_fy_label := lpad(v_fy_start::text, 2, '0') || '-' || lpad(v_fy_end::text, 2, '0');
  v_prefix := 'SB/' || v_fy_label || '/';

  -- Take an advisory lock on the FY prefix so concurrent creates can't
  -- pick the same next number under load.
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

REVOKE ALL ON FUNCTION public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_sales_order(
  text, text, text, numeric, text, text, text, text, text, text, date, text, text, text
) TO service_role;
