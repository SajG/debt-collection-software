-- line_production_status
--
-- Every line on a multi-SKU order has its own production stage. A
-- 4-SKU order is rarely produced simultaneously — the factory ticks
-- lines READY one at a time. The order's currentStatus is derived
-- from the aggregate, in a trigger, so RLS / factory UI / notifications
-- stay authoritative on the header column and cannot drift from what
-- the shop floor actually did.
--
-- Aggregation rule:
--   all lines READY           → READY_TO_DISPATCH
--   any line IN_PRODUCTION    → IN_PRODUCTION
--   otherwise                 → (unchanged if the order is in a
--                                pre-production / terminal state, else
--                                ORDER_PLACED)
--
-- Terminal / pre-production statuses are NEVER overwritten by the
-- rollup — cancellation, rejection, dispatch, delivery, hold,
-- PENDING_APPROVAL, and LR_GENERATED are all owned by explicit user
-- actions or by other triggers (advance_order_status,
-- _on_dispatch_lot_change). This trigger only moves the order
-- between ORDER_PLACED ↔ IN_PRODUCTION ↔ READY_TO_DISPATCH.

CREATE TYPE "LineProductionStatus" AS ENUM (
  'PENDING', 'IN_PRODUCTION', 'READY'
);

ALTER TABLE "SalesOrderItem"
  ADD COLUMN "productionStatus" "LineProductionStatus"
    NOT NULL DEFAULT 'PENDING';

-- Backfill: pre-existing orders that were already advanced past
-- ORDER_PLACED should have their lines reflect the header state, so a
-- factory user opening a mid-flight order doesn't see every line
-- marked PENDING against a header that reads IN_PRODUCTION.
UPDATE "SalesOrderItem" it
   SET "productionStatus" = CASE so."currentStatus"
       WHEN 'IN_PRODUCTION'          THEN 'IN_PRODUCTION'::"LineProductionStatus"
       WHEN 'READY_TO_DISPATCH'      THEN 'READY'::"LineProductionStatus"
       WHEN 'LR_GENERATED'           THEN 'READY'::"LineProductionStatus"
       WHEN 'PARTIALLY_DISPATCHED'   THEN 'READY'::"LineProductionStatus"
       WHEN 'DISPATCHED'             THEN 'READY'::"LineProductionStatus"
       WHEN 'DELIVERED'              THEN 'READY'::"LineProductionStatus"
       ELSE 'PENDING'::"LineProductionStatus"
     END
  FROM "SalesOrder" so
 WHERE so."id" = it."salesOrderId";

CREATE OR REPLACE FUNCTION public._recompute_order_status_from_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id     text;
  v_current      "OrderStatus";
  v_total        int;
  v_ready        int;
  v_in_prod      int;
  v_next         "OrderStatus";
BEGIN
  v_order_id := COALESCE(NEW."salesOrderId", OLD."salesOrderId");

  SELECT "currentStatus" INTO v_current
    FROM "SalesOrder" WHERE "id" = v_order_id;
  IF v_current IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Never overwrite terminal / gated states. Keep this list in sync
  -- with the header state machine — dispatch triggers, cancel/reject
  -- actions, and the approval workflow all own these transitions.
  IF v_current IN (
    'PENDING_APPROVAL', 'ON_HOLD', 'LR_GENERATED',
    'PARTIALLY_DISPATCHED', 'DISPATCHED', 'DELIVERED',
    'REJECTED', 'CANCELLED'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE "productionStatus" = 'READY'),
    count(*) FILTER (WHERE "productionStatus" = 'IN_PRODUCTION')
  INTO v_total, v_ready, v_in_prod
  FROM "SalesOrderItem"
  WHERE "salesOrderId" = v_order_id;

  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_ready = v_total THEN
    v_next := 'READY_TO_DISPATCH';
  ELSIF v_in_prod > 0 OR v_ready > 0 THEN
    -- "any line started" (including any line already READY) means the
    -- order as a whole is IN_PRODUCTION until every line is READY.
    v_next := 'IN_PRODUCTION';
  ELSE
    v_next := 'ORDER_PLACED';
  END IF;

  IF v_next <> v_current THEN
    UPDATE "SalesOrder"
       SET "currentStatus" = v_next,
           "updatedAt"     = now()
     WHERE "id" = v_order_id;

    -- Audit row so the timeline shows why the header moved. Author is
    -- the trigger's session role — a follow-up we'll want to enrich
    -- with the user that ticked the line (via a session GUC / setter
    -- from the RPC that we'll add for the "mark line ready" tap).
    INSERT INTO "OrderStatusEvent" (
      id, "salesOrderId", status, notes, "updatedById", "createdAt"
    ) VALUES (
      replace(gen_random_uuid()::text, '-', ''),
      v_order_id, v_next,
      'Derived from line production status (' ||
        v_ready::text || '/' || v_total::text || ' READY, ' ||
        v_in_prod::text || ' IN_PRODUCTION)',
      COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
        (SELECT id FROM "Profile" WHERE role = 'ADMIN' AND "isActive" = true ORDER BY "createdAt" LIMIT 1)
      ),
      now()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public._recompute_order_status_from_lines() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_recompute_order_from_lines ON "SalesOrderItem";
CREATE TRIGGER trg_recompute_order_from_lines
  AFTER INSERT OR UPDATE OF "productionStatus" OR DELETE ON "SalesOrderItem"
  FOR EACH ROW EXECUTE FUNCTION public._recompute_order_status_from_lines();

-- RLS: FACTORY (and ADMIN) may UPDATE productionStatus on any line
-- whose parent order they can already see. STAFF cannot — the shop
-- floor owns production progression.
DROP POLICY IF EXISTS sales_order_item_update_factory ON "SalesOrderItem";
CREATE POLICY sales_order_item_update_factory
  ON "SalesOrderItem"
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() IN ('FACTORY', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so."id" = "SalesOrderItem"."salesOrderId"
        AND so."needsRateApproval" = false
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('FACTORY', 'ADMIN')
  );
