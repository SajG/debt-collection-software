-- admin_mobile_rpcs
--
-- The mobile app now has an ADMIN group. Two admin actions previously
-- lived only in Next.js server actions (Prisma writes with a Node.js
-- session) — approving a rate exception and deactivating/reactivating
-- a user. Web goes through a server action; mobile must not do Prisma
-- writes with an admin JWT, so we wrap the same logic in
-- SECURITY DEFINER RPCs. Web can migrate to these later; for now the
-- two paths are equivalent.
--
-- Both RPCs:
--   - Verify caller has role = ADMIN (and isActive).
--   - Do the mutation.
--   - Write an audit row (OrderStatusEvent for rate approval;
--     UserAuditLog for user state changes).
-- No new tables. No new policies.

-- ── approve_rate ────────────────────────────────────────────────────
-- Clears SalesOrder.needsRateApproval for an order sitting in the F6
-- rate-approval gate. Stamps rateApproved{ById, At, Note} and appends
-- an [RATE APPROVED] status event (same format the web server action
-- writes so timeline readers don't have to know about two shapes).
CREATE OR REPLACE FUNCTION public.approve_rate(
  p_order_id text,
  p_note     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin   "Profile"%ROWTYPE;
  v_order   "SalesOrder"%ROWTYPE;
  v_note    text;
BEGIN
  SELECT * INTO v_admin FROM "Profile" WHERE id = auth.uid();
  IF v_admin.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_admin."isActive" = false OR v_admin.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may approve rate exceptions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order."needsRateApproval" = false THEN
    RAISE EXCEPTION 'This order does not need rate approval';
  END IF;

  v_note := COALESCE(NULLIF(btrim(p_note), ''), 'Rate approved');

  UPDATE "SalesOrder"
     SET "needsRateApproval" = false,
         "rateApprovedById"  = v_admin.id,
         "rateApprovedAt"    = now(),
         "rateApprovalNote"  = left(v_note, 1000),
         "updatedAt"         = now()
   WHERE id = v_order.id;

  -- If line-level rate approvals exist (SalesOrderItem after
  -- migration 20260824180000_add_sales_order_items), clear those too.
  -- No-op when the table is empty.
  UPDATE "SalesOrderItem"
     SET "needsRateApproval" = false,
         "rateApprovedById"  = v_admin.id,
         "rateApprovedAt"    = now(),
         "rateApprovalNote"  = left(v_note, 1000),
         "updatedAt"         = now()
   WHERE "salesOrderId" = v_order.id
     AND "needsRateApproval" = true;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_order.id, v_order."currentStatus",
    '[RATE APPROVED] ' || left(v_note, 500),
    v_admin.id, now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_rate(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_rate(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_rate(text, text) TO service_role;

-- ── set_user_active ─────────────────────────────────────────────────
-- Toggle Profile.isActive with the same guarantees as the web action:
--   - Cannot deactivate yourself.
--   - Cannot deactivate the last active ADMIN.
--   - Every transition writes a UserAuditLog row (ACTIVATED/DEACTIVATED).
CREATE OR REPLACE FUNCTION public.set_user_active(
  p_target uuid,
  p_active boolean,
  p_note   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin  "Profile"%ROWTYPE;
  v_target "Profile"%ROWTYPE;
  v_others int;
  v_note   text;
BEGIN
  SELECT * INTO v_admin FROM "Profile" WHERE id = auth.uid();
  IF v_admin.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_admin."isActive" = false OR v_admin.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may change user status' USING ERRCODE = '42501';
  END IF;
  IF v_admin.id = p_target AND p_active = false THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  SELECT * INTO v_target FROM "Profile" WHERE id = p_target;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target."isActive" = p_active THEN
    RAISE EXCEPTION 'User is already %', CASE WHEN p_active THEN 'active' ELSE 'deactivated' END;
  END IF;

  -- Last-active-admin guard.
  IF p_active = false AND v_target.role = 'ADMIN' THEN
    SELECT count(*) INTO v_others
      FROM "Profile"
     WHERE role = 'ADMIN'
       AND "isActive" = true
       AND id <> v_target.id;
    IF v_others = 0 THEN
      RAISE EXCEPTION 'Refusing to deactivate the last active ADMIN. Promote someone else first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_note := COALESCE(
    NULLIF(btrim(p_note), ''),
    'by ' || COALESCE(v_admin."ownerName", 'admin')
  );

  UPDATE "Profile"
     SET "isActive"        = p_active,
         "deactivatedAt"   = CASE WHEN p_active THEN NULL ELSE now() END,
         "deactivatedById" = CASE WHEN p_active THEN NULL ELSE v_admin.id END,
         "updatedAt"       = now()
   WHERE id = v_target.id;

  INSERT INTO "UserAuditLog" (
    id, "actorId", "targetProfileId", action, detail, "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_admin.id, v_target.id,
    CASE WHEN p_active THEN 'ACTIVATED' ELSE 'DEACTIVATED' END,
    left(v_note, 1000),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_active(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean, text) TO service_role;
