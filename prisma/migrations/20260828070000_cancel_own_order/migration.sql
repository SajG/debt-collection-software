-- cancel_own_order
--
-- The existing advance_order_status RPC refuses STAFF callers by
-- design — it's the factory's write-forward path (IN_PRODUCTION,
-- READY_TO_DISPATCH, LR_GENERATED, DISPATCHED). Widening it to let
-- STAFF cancel means salespeople could also call every other
-- transition. Instead: a NEW narrow RPC that only cancels, only for
-- the order's own salesperson (or ADMIN), only in statuses where
-- cancelling is safe.
--
-- Rules (enforced inside the function so RLS is not the only gate):
--   * Caller is authenticated + isActive.
--   * Order exists and belongs to the caller, OR caller is ADMIN.
--   * currentStatus ∈ ORDER_PLACED, PENDING_APPROVAL, IN_PRODUCTION,
--     ON_HOLD, READY_TO_DISPATCH. Anything past READY (LR_GENERATED,
--     DISPATCHED, PARTIALLY_DISPATCHED, DELIVERED, CANCELLED,
--     REJECTED) is refused — the factory has already committed
--     material or the order is terminal.
--   * A note is required. Free-text, capped to 1000 chars.
--
-- Writes: SalesOrder.currentStatus = CANCELLED + OrderStatusEvent
-- row so the timeline shows who + when + why.

CREATE OR REPLACE FUNCTION public.cancel_own_order(
  p_order_id text,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    uuid;
  v_role     text;
  v_order    "SalesOrder"%ROWTYPE;
  v_reason   text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_role := public.current_user_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account disabled';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) = 0 THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;
  IF length(v_reason) > 1000 THEN
    v_reason := substring(v_reason FROM 1 FOR 1000);
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Ownership: STAFF can cancel only their own; ADMIN can cancel any.
  IF v_role = 'STAFF' AND v_order."salespersonId" IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'You can only cancel orders you placed';
  END IF;
  IF v_role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only the salesperson or an admin may cancel';
  END IF;

  -- Cancellable statuses. Everything past READY_TO_DISPATCH has
  -- factory material committed; a cancel there is a factory-side
  -- operation, not a self-serve staff one.
  IF v_order."currentStatus" NOT IN (
    'ORDER_PLACED',
    'PENDING_APPROVAL',
    'IN_PRODUCTION',
    'ON_HOLD',
    'READY_TO_DISPATCH'
  ) THEN
    RAISE EXCEPTION 'Order in status % cannot be cancelled from the app', v_order."currentStatus";
  END IF;

  UPDATE "SalesOrder"
     SET "currentStatus" = 'CANCELLED',
         "updatedAt"     = now()
   WHERE id = v_order.id;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_order.id, 'CANCELLED',
    '[CANCELLED BY ' || v_role || '] ' || v_reason,
    v_actor, now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_own_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_own_order(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_order(text, text) TO service_role;

COMMENT ON FUNCTION public.cancel_own_order(text, text) IS
  'Salesperson-facing cancel for orders they placed (ADMIN can cancel any). Refuses cancels once the factory has committed material (LR_GENERATED and beyond). Reason is required and stamped into OrderStatusEvent.';
