-- P1 — approve_order / reject_order RPCs. Mirror the pattern of
-- advance_order_status: SECURITY DEFINER, ADMIN-only, atomic UPDATE
-- + OrderStatusEvent INSERT in one txn. Called from both the web
-- server actions AND mobile (staff)/orders/[id].tsx so ADMINs can
-- approve on the phone without going desk-bound.

CREATE OR REPLACE FUNCTION public.approve_order(
  p_order_id text,
  p_note     text DEFAULT NULL
)
RETURNS TABLE (id text, "currentStatus" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile "Profile"%ROWTYPE;
  v_order   "SalesOrder"%ROWTYPE;
  v_note    text;
BEGIN
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_profile."isActive" = false THEN RAISE EXCEPTION 'Account disabled'; END IF;
  IF v_profile.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may approve orders';
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  v_note := COALESCE(NULLIF(btrim(p_note), ''), 'Order approved');

  -- PENDING_APPROVAL is the first-class path. Leftover F6 rows
  -- (needsRateApproval=true, still in the factory pipeline) are
  -- accepted so the folded /admin/approvals queue can clear them
  -- without a second action.
  IF v_order."currentStatus" = 'PENDING_APPROVAL' THEN
    UPDATE "SalesOrder"
       SET "currentStatus"      = 'ORDER_PLACED',
           "approvedById"       = v_profile.id,
           "approvedAt"         = now(),
           "needsRateApproval"  = false,
           "rateApprovedById"   = v_profile.id,
           "rateApprovedAt"     = now(),
           "rateApprovalNote"   = v_note,
           "updatedAt"          = now()
     WHERE id = p_order_id;

    INSERT INTO "OrderStatusEvent" (
      id, "salesOrderId", status, notes, "updatedById", "createdAt"
    ) VALUES (
      replace(gen_random_uuid()::text, '-', ''),
      p_order_id, 'ORDER_PLACED',
      '[APPROVED] ' || left(v_note, 900),
      v_profile.id, now()
    );

    RETURN QUERY SELECT p_order_id, 'ORDER_PLACED'::text;
  ELSIF v_order."needsRateApproval" = true
     AND v_order."currentStatus" NOT IN ('REJECTED', 'CANCELLED') THEN
    UPDATE "SalesOrder"
       SET "needsRateApproval"  = false,
           "rateApprovedById"   = v_profile.id,
           "rateApprovedAt"     = now(),
           "rateApprovalNote"   = v_note,
           "approvedById"       = v_profile.id,
           "approvedAt"         = now(),
           "updatedAt"          = now()
     WHERE id = p_order_id;

    INSERT INTO "OrderStatusEvent" (
      id, "salesOrderId", status, notes, "updatedById", "createdAt"
    ) VALUES (
      replace(gen_random_uuid()::text, '-', ''),
      p_order_id, v_order."currentStatus",
      '[APPROVED] ' || left(v_note, 900),
      v_profile.id, now()
    );

    RETURN QUERY SELECT p_order_id, v_order."currentStatus"::text;
  ELSE
    RAISE EXCEPTION 'Order is %, not awaiting approval', v_order."currentStatus";
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_order(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_order(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reject_order(
  p_order_id text,
  p_reason   text
)
RETURNS TABLE (id text, "currentStatus" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile "Profile"%ROWTYPE;
  v_order   "SalesOrder"%ROWTYPE;
  v_reason  text;
BEGIN
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_profile."isActive" = false THEN RAISE EXCEPTION 'Account disabled'; END IF;
  IF v_profile.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may reject orders';
  END IF;

  v_reason := NULLIF(btrim(p_reason), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order."currentStatus" <> 'PENDING_APPROVAL'
     AND NOT (
       v_order."needsRateApproval" = true
       AND v_order."currentStatus" NOT IN ('REJECTED', 'CANCELLED')
     ) THEN
    RAISE EXCEPTION 'Order is %, not awaiting approval', v_order."currentStatus";
  END IF;

  UPDATE "SalesOrder"
     SET "currentStatus"     = 'REJECTED',
         "rejectedById"      = v_profile.id,
         "rejectedAt"        = now(),
         "rejectionReason"   = left(v_reason, 1000),
         "updatedAt"         = now()
   WHERE id = p_order_id;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    p_order_id, 'REJECTED',
    '[REJECTED] ' || left(v_reason, 900),
    v_profile.id, now()
  );

  RETURN QUERY SELECT p_order_id, 'REJECTED'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_order(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order(text, text) TO service_role;
