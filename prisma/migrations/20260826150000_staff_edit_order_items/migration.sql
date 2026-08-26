-- staff_edit_order_items
--
-- Any STAFF / ADMIN can now replace the line items on any pre-dispatch
-- order via replace_sales_order_items(p_order_id, p_items jsonb).
-- Header + rollup fields (orderValue, mirrored line-1 scalars) are
-- kept in sync by the existing _rollup_sales_order_from_items trigger.
--
-- Two related fixes:
--
-- 1. enforce_staff_sales_order_update + enforce_factory_sales_order_update
--    now short-circuit when pg_trigger_depth() > 1. The rollup trigger
--    UPDATES SalesOrder (productId, brand, quantity, orderValue, …) as
--    a nested effect of an item write. Without this guard, a STAFF's
--    item-replace would trip the STAFF enforce trigger because those
--    fields are outside the STAFF whitelist — which is correct for a
--    DIRECT header write but wrong for a rollup mirror. Same for FACTORY.
--
-- 2. New RPC replace_sales_order_items — SECURITY DEFINER so it can
--    DELETE + INSERT on SalesOrderItem regardless of RLS (there are no
--    direct write grants on that table). Enforces the same status gate
--    as the header edit RLS. Refuses zero-item payloads.

-- ─────────────────────────────────────────────────────────────────
-- (1) Trigger guards — skip when nested.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_staff_sales_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The rollup trigger fires from _rollup_sales_order_from_items when a
  -- SalesOrderItem row changes. That path legitimately updates fields
  -- outside the STAFF whitelist (productId, brand, quantity, orderValue,
  -- etc.) as a mirror of line 1. Detect the nested case and skip.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF public.current_user_role() = 'STAFF' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber"
      OR NEW."salespersonId" IS DISTINCT FROM OLD."salespersonId"
      OR NEW."productId" IS DISTINCT FROM OLD."productId"
      OR NEW.brand IS DISTINCT FROM OLD.brand
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW."quantityUnit" IS DISTINCT FROM OLD."quantityUnit"
      OR NEW."packingType" IS DISTINCT FROM OLD."packingType"
      OR NEW."sizeKg" IS DISTINCT FROM OLD."sizeKg"
      OR NEW."productRate" IS DISTINCT FROM OLD."productRate"
      OR NEW."orderValue" IS DISTINCT FROM OLD."orderValue"
      OR NEW."currentStatus" IS DISTINCT FROM OLD."currentStatus"
      OR NEW."expectedProductionDate" IS DISTINCT FROM OLD."expectedProductionDate"
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
      OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById"
      OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
      OR NEW."rejectedById" IS DISTINCT FROM OLD."rejectedById"
      OR NEW."rejectedAt" IS DISTINCT FROM OLD."rejectedAt"
      OR NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
      OR NEW."deliveredAt" IS DISTINCT FROM OLD."deliveredAt"
    THEN
      RAISE EXCEPTION
        'STAFF may only edit customer + delivery details (partyId, newCustomerName, dispatchLocation, paymentTerm, transportType, expectedDeliveryDate, tokenType, notes)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_factory_sales_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Same nested-trigger short-circuit as the STAFF guard — the rollup
  -- from a SalesOrderItem change legitimately updates mirrored fields
  -- that are outside the FACTORY whitelist.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

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
      OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById"
      OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
      OR NEW."rejectedById" IS DISTINCT FROM OLD."rejectedById"
      OR NEW."rejectedAt" IS DISTINCT FROM OLD."rejectedAt"
      OR NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
    THEN
      RAISE EXCEPTION 'FACTORY may only update currentStatus and expectedProductionDate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- (2) replace_sales_order_items — atomic delete+insert of the full
-- item set for one order. Same status gate as the STAFF header UPDATE
-- policy. Same validation as create_sales_order_v2 (auth, per-line
-- product resolution, new-product stub, qty > 0). No credit / floor
-- checks — matches current placement policy.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.replace_sales_order_items(
  p_order_id text,
  p_items    jsonb
)
RETURNS TABLE (id text, "orderValue" numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile         "Profile"%ROWTYPE;
  v_order           "SalesOrder"%ROWTYPE;
  v_item            jsonb;
  v_line_number     int := 0;
  v_line_qty        numeric;
  v_line_rate_num   numeric;
  v_line_value      numeric(12,2);
  v_line_product    "Product"%ROWTYPE;
  v_line_product_id text;
  v_new_product     text;
  v_prod_brand      text;
  v_total           numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_profile."isActive" = false THEN
    RAISE EXCEPTION 'Account disabled';
  END IF;
  IF v_profile.role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only STAFF or ADMIN may edit order items';
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order."currentStatus" IN (
    'DISPATCHED','PARTIALLY_DISPATCHED','DELIVERED','CANCELLED','REJECTED'
  ) THEN
    RAISE EXCEPTION
      'Cannot edit items on a % order', v_order."currentStatus";
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  CREATE TEMP TABLE _tmp_items (
    line_number   int,
    product_id    text,
    brand         text,
    quantity      numeric(10,3),
    quantity_unit text,
    packing_type  text,
    size_kg       text,
    product_rate  text,
    line_value    numeric(12,2)
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
    v_total := v_total + v_line_value;
  END LOOP;

  DELETE FROM "SalesOrderItem" WHERE "salesOrderId" = p_order_id;

  INSERT INTO "SalesOrderItem" (
    id, "salesOrderId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "lineValue", "lineNumber",
    "needsRateApproval",
    "createdAt", "updatedAt"
  )
  SELECT
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id, ti.product_id, ti.brand,
    ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg,
    ti.product_rate, ti.line_value, ti.line_number,
    false, now(), now()
  FROM _tmp_items ti
  ORDER BY ti.line_number;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id,
    v_order."currentStatus",
    format(
      'Line items edited by %s (%s line%s, total %s)',
      v_profile."ownerName", v_line_number,
      CASE WHEN v_line_number = 1 THEN '' ELSE 's' END,
      to_char(v_total, 'FM999,999,990.00')
    ),
    v_profile.id, now()
  );

  RETURN QUERY SELECT p_order_id, v_total::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_sales_order_items(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_sales_order_items(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_sales_order_items(text, jsonb) TO service_role;
