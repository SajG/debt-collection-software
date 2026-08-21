-- ─────────────────────────────────────────────────────────────────
-- Re-emit create_sales_order with the ADMIN-at-placement rate
-- self-approval block (v_rate_approved_by / v_rate_approved_at /
-- v_rate_note). The block was in the P1 migration file on disk but
-- an earlier version of that migration was applied to the DB before
-- the block existed, and Prisma won't re-run a migration whose
-- filename is unchanged. This migration re-applies the full function
-- body so ADMIN below-floor placements clear needsRateApproval at
-- creation time and become visible to FACTORY without a second gate.
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
  p_new_product_name      text DEFAULT NULL,
  p_credit_override_note  text DEFAULT NULL
)
RETURNS TABLE (id text, "orderNumber" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile          "Profile"%ROWTYPE;
  v_product          "Product"%ROWTYPE;
  v_party            "Party"%ROWTYPE;
  v_fy_start         int;
  v_fy_end           int;
  v_fy_label         text;
  v_prefix           text;
  v_count            int;
  v_number           text;
  v_id               text;
  v_rate_num         numeric;
  v_value            numeric;
  v_new_name         text;
  v_new_product      text;
  v_prod_brand       text;
  v_limited          boolean;
  v_needs_approv     boolean := false;
  v_credit_passed    boolean := true;
  v_override_by      uuid    := NULL;
  v_override_note    text    := NULL;
  v_projected        numeric;
  v_over_limit       boolean := false;
  v_is_new_customer  boolean := false;
  v_mode             "OrderApprovalMode";
  v_initial_status   "OrderStatus";
  v_seed_note        text;
  v_rate_approved_by uuid        := NULL;
  v_rate_approved_at timestamptz := NULL;
  v_rate_note        text        := NULL;
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
  v_is_new_customer := (v_party.id IS NULL);

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

  IF v_product."floorRate" IS NOT NULL
     AND v_rate_num > 0
     AND v_rate_num < v_product."floorRate" THEN
    v_needs_approv := true;
  END IF;

  -- Approval mode from the singleton BusinessSettings row.
  SELECT "orderApprovalMode" INTO v_mode
  FROM "BusinessSettings" LIMIT 1;
  IF v_mode IS NULL THEN v_mode := 'EXCEPTIONS_ONLY'; END IF;

  -- Credit-limit projection.
  IF v_party.id IS NOT NULL AND v_party."creditLimit" IS NOT NULL THEN
    v_projected := COALESCE(v_party."totalOutstanding", 0) + v_value;
    IF v_projected > v_party."creditLimit" THEN
      v_over_limit := true;
    END IF;
  END IF;

  -- Credit gate. Behaviour depends on role + mode:
  --   ADMIN over-limit → override note required, ORDER_PLACED
  --                      (admins self-approve at placement).
  --   STAFF over-limit + mode = NONE       → hard block (unchanged).
  --   STAFF over-limit + mode <> NONE      → soft: route to
  --                                          PENDING_APPROVAL,
  --                                          creditCheckPassed=false.
  IF v_over_limit THEN
    IF v_profile.role = 'ADMIN' THEN
      IF NULLIF(btrim(p_credit_override_note), '') IS NULL THEN
        RAISE EXCEPTION
          'Override note required to place this order past the credit limit.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_credit_passed := false;
      v_override_by   := v_profile.id;
      v_override_note := btrim(p_credit_override_note);
    ELSE
      IF v_mode = 'NONE' THEN
        RAISE EXCEPTION
          'Credit limit would be exceeded — ask an admin to review, or collect outstanding first.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_credit_passed := false;
    END IF;
  END IF;

  -- Compute the initial status. ADMIN placements never enter the
  -- approval queue — they are the queue.
  IF v_profile.role = 'ADMIN' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSIF v_mode = 'NONE' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSIF v_mode = 'ALL' THEN
    v_initial_status := 'PENDING_APPROVAL';
  ELSE  -- EXCEPTIONS_ONLY
    IF v_needs_approv OR v_over_limit OR v_is_new_customer THEN
      v_initial_status := 'PENDING_APPROVAL';
    ELSE
      v_initial_status := 'ORDER_PLACED';
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

  SELECT COALESCE(
    MAX(NULLIF(substring("orderNumber" FROM (length(v_prefix) + 1)), '')::int),
    0
  )
    INTO v_count
    FROM "SalesOrder"
   WHERE "orderNumber" LIKE v_prefix || '%';

  v_number := v_prefix || lpad((v_count + 1)::text, 4, '0');
  v_id := replace(gen_random_uuid()::text, '-', '');

  v_seed_note := CASE v_initial_status
    WHEN 'PENDING_APPROVAL' THEN 'Order placed — awaiting admin approval'
    ELSE 'Order placed'
  END;
  IF v_needs_approv THEN
    v_seed_note := v_seed_note || ' (below floor rate)';
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

  -- ADMIN placements never sit in the factory-hidden rate gate —
  -- the director already reviewed at placement. Stamp the F6
  -- columns for audit, then clear needsRateApproval so the order
  -- is visible on the shop floor. Seed note still records the
  -- below-floor exception.
  IF v_profile.role = 'ADMIN' AND v_needs_approv THEN
    v_rate_approved_by := v_profile.id;
    v_rate_approved_at := now();
    v_rate_note        := 'Self-approved at placement';
    v_needs_approv     := false;
  END IF;

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
    "rateApprovedById", "rateApprovedAt", "rateApprovalNote",
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
    NULLIF(btrim(p_notes), ''), v_initial_status,
    v_credit_passed, v_override_by, v_override_note,
    v_needs_approv,
    v_rate_approved_by, v_rate_approved_at, v_rate_note,
    now(), now()
  );

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_id, v_initial_status, v_seed_note, v_profile.id, now()
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
