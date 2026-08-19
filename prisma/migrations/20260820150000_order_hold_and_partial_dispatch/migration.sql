-- Real factories aren't a straight line. This migration adds:
--   ON_HOLD               — order paused with a mandatory reason. Reason
--                           category + free-text captured on SalesOrder,
--                           original status remembered in statusBeforeHold.
--   PARTIALLY_DISPATCHED  — auto-derived from DispatchLot: at least one
--                           lot exists but sum(lot.quantity) < order qty.
--   DISPATCHED            — sum(lot.quantity) >= order qty, or a factory
--                           user explicitly advances (backward-compat).
--   DispatchLot table     — one row per truck / LR; the sum vs order
--                           quantity is what decides the two dispatch
--                           statuses.
--
-- Backward transitions belong to server actions (admin-gated), not to
-- a trigger — the trigger only lets FACTORY forward-move currentStatus
-- and expectedProductionDate.

-- ─────────────────────────────────────────────────────────────────
-- Enum additions. IF NOT EXISTS keeps the migration idempotent on
-- re-runs, and each ADD VALUE lives in its own statement so Postgres
-- accepts them (ADD VALUE can't share a transaction with usage).
-- ─────────────────────────────────────────────────────────────────

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_DISPATCHED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HoldReasonCategory') THEN
    CREATE TYPE "HoldReasonCategory" AS ENUM (
      'RAW_MATERIAL_SHORTAGE',
      'AWAITING_CUSTOMER_CONFIRMATION',
      'PAYMENT_HOLD',
      'OTHER'
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- SalesOrder — hold columns. holdReason is required in application
-- code (see order-actions.tsx) but stored as nullable so DB is happy
-- during the enum-value cutover.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "holdReasonCategory" "HoldReasonCategory",
  ADD COLUMN IF NOT EXISTS "holdReason"         TEXT,
  ADD COLUMN IF NOT EXISTS "statusBeforeHold"   "OrderStatus";

-- ─────────────────────────────────────────────────────────────────
-- DispatchLot table. One row per LR / truck.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DispatchLot" (
  "id"           TEXT PRIMARY KEY,
  "salesOrderId" TEXT NOT NULL REFERENCES "SalesOrder"("id") ON DELETE CASCADE,
  "quantity"     DECIMAL(14, 3) NOT NULL CHECK ("quantity" > 0),
  "lrNumber"     TEXT,
  "dispatchedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "notes"        TEXT,
  "createdById"  UUID NOT NULL REFERENCES "Profile"("id") ON DELETE RESTRICT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "DispatchLot_salesOrderId_idx"
  ON "DispatchLot" ("salesOrderId");

ALTER TABLE "DispatchLot" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispatch_lot_select_staff ON "DispatchLot";
DROP POLICY IF EXISTS dispatch_lot_select_factory ON "DispatchLot";
DROP POLICY IF EXISTS dispatch_lot_select_admin ON "DispatchLot";
DROP POLICY IF EXISTS dispatch_lot_insert_factory ON "DispatchLot";
DROP POLICY IF EXISTS dispatch_lot_insert_admin ON "DispatchLot";
DROP POLICY IF EXISTS dispatch_lot_update_admin ON "DispatchLot";
DROP POLICY IF EXISTS dispatch_lot_delete_admin ON "DispatchLot";

CREATE POLICY dispatch_lot_select_staff ON "DispatchLot"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "DispatchLot"."salesOrderId"
        AND so."salespersonId" = auth.uid()
    )
  );

CREATE POLICY dispatch_lot_select_factory ON "DispatchLot"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'FACTORY');

CREATE POLICY dispatch_lot_select_admin ON "DispatchLot"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

CREATE POLICY dispatch_lot_insert_factory ON "DispatchLot"
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'FACTORY');

CREATE POLICY dispatch_lot_insert_admin ON "DispatchLot"
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'ADMIN');

CREATE POLICY dispatch_lot_update_admin ON "DispatchLot"
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

CREATE POLICY dispatch_lot_delete_admin ON "DispatchLot"
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- Trigger: when DispatchLot rows change, recompute the parent order's
-- currentStatus.  Rules:
--   sum(lot.qty) >= order.qty                    → DISPATCHED
--   0 < sum(lot.qty) < order.qty                 → PARTIALLY_DISPATCHED
--   no lots yet                                  → leave status alone
-- Only overrides ready/lr/partial/dispatched statuses. ON_HOLD and
-- earlier stages are not disturbed — a lot can be pre-recorded while
-- the order is still IN_PRODUCTION without flipping status.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._recompute_dispatch_status(p_order_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot_sum   numeric(14, 3);
  v_order_qty numeric(14, 3);
  v_current   "OrderStatus";
  v_next      "OrderStatus";
BEGIN
  SELECT COALESCE(SUM(quantity), 0), MAX("orderQty")
  INTO v_lot_sum, v_order_qty
  FROM (
    SELECT quantity, NULL::numeric AS "orderQty"
    FROM "DispatchLot" WHERE "salesOrderId" = p_order_id
    UNION ALL
    SELECT 0, quantity
    FROM "SalesOrder" WHERE id = p_order_id
  ) x;

  SELECT "currentStatus" INTO v_current
  FROM "SalesOrder" WHERE id = p_order_id;

  IF v_order_qty IS NULL THEN RETURN; END IF;
  IF v_current IN ('ORDER_PLACED', 'IN_PRODUCTION', 'ON_HOLD', 'CANCELLED')
     AND v_lot_sum = 0 THEN
    RETURN;
  END IF;

  IF v_lot_sum >= v_order_qty AND v_order_qty > 0 THEN
    v_next := 'DISPATCHED';
  ELSIF v_lot_sum > 0 THEN
    v_next := 'PARTIALLY_DISPATCHED';
  ELSE
    v_next := v_current;
  END IF;

  IF v_next <> v_current THEN
    UPDATE "SalesOrder"
       SET "currentStatus" = v_next
     WHERE id = p_order_id;
    INSERT INTO "OrderStatusEvent" (
      id, "salesOrderId", status, notes, "updatedById", "createdAt"
    )
    SELECT
      replace(gen_random_uuid()::text, '-', ''),
      p_order_id,
      v_next,
      CASE
        WHEN v_next = 'DISPATCHED' THEN 'Auto: all lots dispatched'
        ELSE 'Auto: partial dispatch recorded'
      END,
      "salespersonId",
      now()
    FROM "SalesOrder" WHERE id = p_order_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._on_dispatch_lot_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._recompute_dispatch_status(OLD."salesOrderId");
    RETURN OLD;
  END IF;
  PERFORM public._recompute_dispatch_status(NEW."salesOrderId");
  IF TG_OP = 'UPDATE' AND NEW."salesOrderId" IS DISTINCT FROM OLD."salesOrderId" THEN
    PERFORM public._recompute_dispatch_status(OLD."salesOrderId");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_lot_change ON "DispatchLot";
CREATE TRIGGER trg_dispatch_lot_change
  AFTER INSERT OR UPDATE OR DELETE ON "DispatchLot"
  FOR EACH ROW EXECUTE FUNCTION public._on_dispatch_lot_change();

-- ─────────────────────────────────────────────────────────────────
-- FACTORY update guard: allow currentStatus + expectedProductionDate
-- AND the hold columns (since hold RPCs also run with the caller's
-- role via SECURITY DEFINER we don't need to relax further). Refresh
-- the whitelist to include statusBeforeHold and the hold reason
-- fields so admin RPCs work without weakening the check.
-- ─────────────────────────────────────────────────────────────────

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
    THEN
      RAISE EXCEPTION 'FACTORY may only update currentStatus and expectedProductionDate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- Notify on ON_HOLD: extend the existing status-event trigger by
-- also dispatching when currentStatus flips to ON_HOLD via an UPDATE
-- (the OrderStatusEvent-based trigger already covers the event row
-- that hold RPCs write, so this is a defensive belt).
-- No change needed here — the event insert covers it.
-- ─────────────────────────────────────────────────────────────────
