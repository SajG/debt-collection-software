-- F6 — Rate approval workflow. Reuses the credit-override pattern
-- (creditOverrideById / creditOverrideNote / creditCheckPassed) —
-- see lib/orders/create.ts for the shape we mirror.
--
-- Product.floorRate is optional. When set and an order is placed
-- below it, SalesOrder.needsRateApproval flips true. Factory
-- shouldn't act on the order until an admin approves it.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "floorRate" DECIMAL(14, 2);

ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "needsRateApproval"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rateApprovedById"     UUID REFERENCES "Profile"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "rateApprovedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "rateApprovalNote"     TEXT;

-- Add rate-approval flag to the whitelist so FACTORY updates can't
-- flip it — same enforcement pattern as the credit fields.
CREATE OR REPLACE FUNCTION public.enforce_factory_sales_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'FACTORY' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber"
      OR NEW."partyId" IS DISTINCT FROM OLD."partyId"
      OR NEW."newCustomerName" IS DISTINCT FROM OLD."newCustomerName"
      OR NEW."salespersonId" IS DISTINCT FROM OLD."salespersonId"
      OR NEW."productId" IS DISTINCT FROM OLD."productId"
      OR NEW.brand IS DISTINCT FROM OLD.brand
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW."quantityUnit" IS DISTINCT FROM OLD."quantityUnit"
      OR NEW."packingType" IS DISTINCT FROM OLD."packingType"
      OR NEW."sizeKg" IS DISTINCT FROM OLD."sizeKg"
      OR NEW."productRate" IS DISTINCT FROM OLD."productRate"
      OR NEW."orderValue" IS DISTINCT FROM OLD."orderValue"
      OR NEW."paymentTerm" IS DISTINCT FROM OLD."paymentTerm"
      OR NEW."transportType" IS DISTINCT FROM OLD."transportType"
      OR NEW."expectedDeliveryDate" IS DISTINCT FROM OLD."expectedDeliveryDate"
      OR NEW."dispatchLocation" IS DISTINCT FROM OLD."dispatchLocation"
      OR NEW."tokenType" IS DISTINCT FROM OLD."tokenType"
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW."linkedInvoiceId" IS DISTINCT FROM OLD."linkedInvoiceId"
      OR NEW."creditCheckPassed" IS DISTINCT FROM OLD."creditCheckPassed"
      OR NEW."creditOverrideById" IS DISTINCT FROM OLD."creditOverrideById"
      OR NEW."creditOverrideNote" IS DISTINCT FROM OLD."creditOverrideNote"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR NEW."statusBeforeHold" IS DISTINCT FROM OLD."statusBeforeHold"
      OR NEW."holdReasonCategory" IS DISTINCT FROM OLD."holdReasonCategory"
      OR NEW."holdReason" IS DISTINCT FROM OLD."holdReason"
      OR NEW."needsRateApproval" IS DISTINCT FROM OLD."needsRateApproval"
      OR NEW."rateApprovedById" IS DISTINCT FROM OLD."rateApprovedById"
      OR NEW."rateApprovedAt" IS DISTINCT FROM OLD."rateApprovedAt"
      OR NEW."rateApprovalNote" IS DISTINCT FROM OLD."rateApprovalNote"
    THEN
      RAISE EXCEPTION 'FACTORY may only update currentStatus and expectedProductionDate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Wire the rate check into create_sales_order. The RPC already runs
-- inside a transaction; the flag flip lands with the INSERT.
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
  v_profile      "Profile"%ROWTYPE;
  v_product      "Product"%ROWTYPE;
  v_party        "Party"%ROWTYPE;
  v_fy_start     int;
  v_fy_end       int;
  v_fy_label     text;
  v_prefix       text;
  v_count        int;
  v_number       text;
  v_id           text;
  v_rate_num     numeric;
  v_value        numeric;
  v_new_name     text;
  v_new_product  text;
  v_prod_brand   text;
  v_limited      boolean;
  v_needs_approv boolean := false;
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

  -- Rate approval check. Below floor → requires admin approval
  -- before the factory acts. Admin can still place a below-floor
  -- order themselves; the flag flips true either way for audit.
  IF v_product."floorRate" IS NOT NULL
     AND v_rate_num > 0
     AND v_rate_num < v_product."floorRate" THEN
    v_needs_approv := true;
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
    notes, "currentStatus", "creditCheckPassed", "needsRateApproval",
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
    NULLIF(btrim(p_notes), ''), 'ORDER_PLACED', true, v_needs_approv,
    now(), now()
  );

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_id, 'ORDER_PLACED',
    CASE WHEN v_needs_approv
      THEN 'Order placed — awaiting admin rate approval (below floor)'
      ELSE 'Order placed'
    END,
    v_profile.id, now()
  );

  RETURN QUERY SELECT v_id, v_number;
END;
$$;
