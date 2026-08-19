-- Security hardening pass for a small, closed user base:
--   1. NotificationConfig.edgeFunctionSecret is no longer readable
--      from any authenticated JWT. Admins get a boolean via
--      is_notification_config_ready(); writes still go through the
--      existing admin UPDATE policy. Only service_role can read the
--      column itself.
--   2. Rate limits on high-cardinality writes (sales orders + order
--      documents) so a compromised device cannot flood the DB or the
--      storage bill.

-- ─────────────────────────────────────────────────────────────────
-- 1. Drop the SELECT policy that exposed the shared secret.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS notification_config_select_admin ON "NotificationConfig";

-- Admins still need to know "is this configured?" — expose a boolean
-- through a SECURITY DEFINER function that never returns the secret
-- string itself.
CREATE OR REPLACE FUNCTION public.is_notification_config_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "NotificationConfig"
    WHERE id = 'singleton'
      AND "edgeFunctionUrl" IS NOT NULL AND "edgeFunctionUrl" <> ''
      AND "edgeFunctionSecret" IS NOT NULL AND "edgeFunctionSecret" <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.is_notification_config_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_notification_config_ready() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_notification_config_ready() TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 2. Rate limits on writes. Existing check_phone_otp_rate_limit
--    covers the sign-in path; these mirror it for the two writes
--    that actually touch storage and heavy DB paths.
--
-- Called from server actions / RPCs before performing the write.
-- Not called from RLS itself because the correct answer for a
-- limit hit is "429 with retry-after", not a silent RLS deny.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_order_create_rate_limit(
  p_profile_id uuid
)
RETURNS TABLE (limited boolean, retry_after_minutes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- 30 sales orders per salesperson per hour is 10x the busiest
  -- day observed in the pilot. Anything above that is a bug or a
  -- compromised device.
  SELECT count(*)
  INTO v_count
  FROM "SalesOrder"
  WHERE "salespersonId" = p_profile_id
    AND "createdAt" > now() - interval '1 hour';
  RETURN QUERY SELECT v_count >= 30, 60;
END;
$$;

REVOKE ALL ON FUNCTION public.check_order_create_rate_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_order_create_rate_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_order_create_rate_limit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_document_upload_rate_limit(
  p_profile_id uuid
)
RETURNS TABLE (limited boolean, retry_after_minutes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- 60 uploads per user per hour covers the busiest LR / invoice
  -- burst a factory would ever do. Payment and order docs share
  -- the same counter — they hit the same storage bucket.
  SELECT
    (SELECT count(*) FROM "OrderDocument"
      WHERE "uploadedById" = p_profile_id
        AND "createdAt" > now() - interval '1 hour')
    +
    (SELECT count(*) FROM "PaymentDocument"
      WHERE "uploadedById" = p_profile_id
        AND "createdAt" > now() - interval '1 hour')
  INTO v_count;
  RETURN QUERY SELECT v_count >= 60, 60;
END;
$$;

REVOKE ALL ON FUNCTION public.check_document_upload_rate_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_document_upload_rate_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_document_upload_rate_limit(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- Wire order rate limit into create_sales_order RPC. The RPC is
-- SECURITY DEFINER already so this runs before any INSERT.
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
  v_limited     boolean;
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
