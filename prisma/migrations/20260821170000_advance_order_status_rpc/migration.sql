-- P0-D — Atomic, validated status advance.
--
-- Before:
--   mobile/app/(factory)/orders/[id].tsx did
--     supabase.from("SalesOrder").update({currentStatus: target})
--     supabase.from("OrderStatusEvent").insert({...})
--   as two sequential writes with no txn. A dropped connection
--   between them left currentStatus advanced with no audit row.
--
--   web app/(dashboard)/production/actions.ts wrapped its two writes
--   in db.$transaction — atomic — but trusted the client's
--   expectedNext value only after computing nextOrderStatus(). A
--   crafted request could theoretically pass through if the client
--   short-circuits.
--
-- After: single SECURITY DEFINER RPC that
--   1. enforces the transition table (see ORDER_STATUS_SEQUENCE in
--      lib/orders/status.ts) — no backwards moves, no skips, no
--      arbitrary jumps to DISPATCHED
--   2. refuses on ON_HOLD, terminal states, and needsRateApproval
--   3. does the UPDATE + INSERT in one txn
--   4. stamps deliveredAt on DELIVERED
--   5. requires FACTORY or ADMIN
--
-- CANCELLED is a valid target from any pre-DISPATCHED, non-cancelled
-- status (we already model cancellation as a side exit — see
-- cancelSalesOrderAction on the web).

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
-- RETURNS TABLE OUT columns (id, currentStatus) collide with real
-- columns on SalesOrder inside this body — see the same
-- shadowing note on create_sales_order.
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

  -- Cast the text target once so a bad value fails cleanly.
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

  IF v_order."currentStatus" = v_target THEN
    RAISE EXCEPTION
      'Order is already in status %', v_target;
  END IF;

  -- Forward pipeline (mirror lib/orders/status.ts ORDER_STATUS_SEQUENCE):
  --   ORDER_PLACED → IN_PRODUCTION
  --   IN_PRODUCTION → READY_TO_DISPATCH
  --   READY_TO_DISPATCH → LR_GENERATED
  --   LR_GENERATED → DISPATCHED
  --   DISPATCHED → DELIVERED
  --
  -- Side exits: CANCELLED from any pre-terminal, non-CANCELLED status.
  -- DELIVERED and CANCELLED are terminal.
  IF v_target = 'CANCELLED' THEN
    IF v_order."currentStatus" IN ('DISPATCHED', 'DELIVERED', 'CANCELLED') THEN
      RAISE EXCEPTION
        'Cannot cancel an order that is already %', v_order."currentStatus";
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

  -- Atomic — one statement each, both in the same implicit txn.
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

REVOKE ALL ON FUNCTION public.advance_order_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_order_status(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order_status(text, text, text) TO service_role;
