-- P1 — first-class admin order-approval workflow.
--
-- Design (spelled out here so future readers don't have to
-- reverse-engineer the RPC):
--
--   OrderApprovalMode (BusinessSettings.orderApprovalMode)
--     NONE             — every order goes straight to ORDER_PLACED;
--                        matches pre-P1 behaviour.
--     EXCEPTIONS_ONLY  — orders with any of {below-floor rate,
--                        over credit limit, unrecognised new
--                        customer} route to PENDING_APPROVAL;
--                        everything else goes to ORDER_PLACED.
--     ALL              — every STAFF order routes to PENDING_APPROVAL.
--
--   ADMIN placements never route to PENDING_APPROVAL — the admin has
--   already reviewed at placement time. Below-floor ADMIN orders
--   stamp rateApproved* and clear needsRateApproval so the factory
--   can start; the seed event still records the exception.
--
--   PENDING_APPROVAL orders are invisible to FACTORY (RLS + BEFORE
--   UPDATE trigger, same pattern as P0-C).
--
--   Approval leaves ORDER_PLACED (approve) or REJECTED (reject) via
--   two new server actions in production/actions.ts. Rejection is
--   terminal; the salesperson gets a push (existing status-change
--   trigger handles it).
--
-- Default is EXCEPTIONS_ONLY so a distributor is not approving fifty
-- routine orders a day.

-- Enum values (PENDING_APPROVAL, REJECTED, OrderApprovalMode) were
-- created in the sibling migration 20260821195000_order_approval_enum_values
-- so this migration can USE them without hitting SQLSTATE 55P04
-- ("unsafe use of new value of enum type").

-- ─────────────────────────────────────────────────────────────────
-- BusinessSettings + SalesOrder columns.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "orderApprovalMode" "OrderApprovalMode"
    NOT NULL DEFAULT 'EXCEPTIONS_ONLY';

ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "approvedById"     UUID REFERENCES "Profile"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "approvedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "rejectedById"     UUID REFERENCES "Profile"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "rejectedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "rejectionReason"  TEXT;

-- Existing below-floor holds lived in ORDER_PLACED + needsRateApproval
-- and were shown on /admin/rate-approvals. That page now redirects to
-- /admin/approvals, which lists PENDING_APPROVAL. Move those rows so
-- they stay in the queue and stay hidden from FACTORY. Other statuses
-- (IN_PRODUCTION onwards) are left alone — production already started.
UPDATE "SalesOrder"
   SET "currentStatus" = 'PENDING_APPROVAL'
 WHERE "needsRateApproval" = true
   AND "currentStatus" = 'ORDER_PLACED';

-- ─────────────────────────────────────────────────────────────────
-- FACTORY RLS — hide PENDING_APPROVAL (and REJECTED, which is
-- terminal for factory) the same way needsRateApproval was hidden.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS sales_order_select_factory ON "SalesOrder";
DROP POLICY IF EXISTS sales_order_update_factory ON "SalesOrder";

CREATE POLICY sales_order_select_factory ON "SalesOrder"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'FACTORY'
    AND "needsRateApproval" = false
    AND "currentStatus" NOT IN ('PENDING_APPROVAL', 'REJECTED')
  );

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

-- Related tables: FACTORY must not read events / documents on
-- orders they cannot see. Same EXISTS-on-SalesOrder pattern as
-- the STAFF policies, plus the P1 visibility predicates.
DROP POLICY IF EXISTS order_status_event_select_factory ON "OrderStatusEvent";
CREATE POLICY order_status_event_select_factory ON "OrderStatusEvent"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'FACTORY'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderStatusEvent"."salesOrderId"
        AND so."needsRateApproval" = false
        AND so."currentStatus" NOT IN ('PENDING_APPROVAL', 'REJECTED')
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
        AND so."needsRateApproval" = false
        AND so."currentStatus" NOT IN ('PENDING_APPROVAL', 'REJECTED')
    )
  );

-- Trigger: refresh the FACTORY guard so it also blocks
-- approval / rejection field writes, and refuses to act on
-- PENDING_APPROVAL / REJECTED orders even if a future policy
-- loosens visibility.
CREATE OR REPLACE FUNCTION public.enforce_factory_sales_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'FACTORY' THEN
    IF OLD."needsRateApproval" = true
       OR OLD."currentStatus" IN ('PENDING_APPROVAL', 'REJECTED') THEN
      RAISE EXCEPTION
        'FACTORY may not act on orders awaiting or refused approval'
        USING ERRCODE = 'check_violation';
    END IF;
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
-- advance_order_status — refuse on PENDING_APPROVAL and REJECTED.
-- The approve / reject actions are the only way out of those two
-- states (both go through server actions, not this RPC).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.advance_order_status(
  p_order_id text,
  p_target   text,
  p_note     text DEFAULT NULL
)
RETURNS TABLE (id text, "currentStatus" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile   "Profile"%ROWTYPE;
  v_order     "SalesOrder"%ROWTYPE;
  v_target    "OrderStatus";
  v_allowed   boolean := false;
  v_note      text;
BEGIN
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_profile."isActive" = false THEN
    RAISE EXCEPTION 'Account disabled';
  END IF;
  IF v_profile.role NOT IN ('FACTORY', 'ADMIN') THEN
    RAISE EXCEPTION 'Only FACTORY or ADMIN may advance order status';
  END IF;

  BEGIN
    v_target := p_target::"OrderStatus";
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid target status: %', p_target;
  END;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order."needsRateApproval" = true THEN
    RAISE EXCEPTION
      'This order is awaiting admin rate approval and cannot be advanced';
  END IF;

  IF v_order."currentStatus" IN ('PENDING_APPROVAL', 'REJECTED') THEN
    RAISE EXCEPTION
      'This order is % — use approveOrderAction / rejectOrderAction to move it out',
      v_order."currentStatus";
  END IF;

  IF v_order."currentStatus" = v_target THEN
    RAISE EXCEPTION 'Order is already in status %', v_target;
  END IF;

  IF v_target = 'CANCELLED' THEN
    IF v_order."currentStatus" IN ('DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED') THEN
      RAISE EXCEPTION 'Cannot cancel an order that is already %', v_order."currentStatus";
    END IF;
    v_allowed := true;
  ELSIF v_order."currentStatus" = 'ORDER_PLACED'          AND v_target = 'IN_PRODUCTION'     THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'IN_PRODUCTION'         AND v_target = 'READY_TO_DISPATCH' THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'READY_TO_DISPATCH'     AND v_target = 'LR_GENERATED'      THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'LR_GENERATED'          AND v_target = 'DISPATCHED'        THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'DISPATCHED'            AND v_target = 'DELIVERED'         THEN v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION
      'Cannot advance status % → % (backwards or skip)',
      v_order."currentStatus", v_target;
  END IF;

  v_note := COALESCE(NULLIF(btrim(p_note), ''), 'Status advanced');

  UPDATE "SalesOrder"
     SET "currentStatus" = v_target,
         "deliveredAt"   = CASE
           WHEN v_target = 'DELIVERED' AND "deliveredAt" IS NULL
             THEN now()
           ELSE "deliveredAt"
         END,
         "updatedAt"     = now()
   WHERE id = p_order_id;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id, v_target, left(v_note, 1000), v_profile.id, now()
  );

  RETURN QUERY SELECT p_order_id, v_target::text;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- create_sales_order — compute initial status from approval mode.
-- Also stops raising STAFF-over-limit when the mode routes to
-- PENDING_APPROVAL (mode=EXCEPTIONS_ONLY | ALL). ADMIN behaviour is
-- unchanged: ADMIN over-limit still needs an override note and
-- lands in ORDER_PLACED (self-approved at placement).
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

-- Skip the seed event on PENDING_APPROVAL the same way we skip
-- 'Order placed' on ORDER_PLACED — the salesperson already saw the
-- confirmation locally. Rejection / approval events still fire.
CREATE OR REPLACE FUNCTION public._notify_on_order_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order "SalesOrder"%ROWTYPE;
BEGIN
  IF NEW.status = 'ORDER_PLACED' AND NEW.notes = 'Order placed' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'PENDING_APPROVAL'
     AND NEW.notes LIKE 'Order placed%' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = NEW."salesOrderId";
  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public._dispatch_notification(jsonb_build_object(
    'event',        'status_change',
    'salesOrderId', v_order.id,
    'orderNumber',  v_order."orderNumber",
    'status',       NEW.status,
    'salespersonId', v_order."salespersonId",
    'rejectionReason', v_order."rejectionReason"
  ));
  RETURN NEW;
END;
$$;
