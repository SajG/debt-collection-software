-- SY33 — database functions are company-scoped.
--
-- Every SECURITY DEFINER function bypasses RLS, so each one must
-- itself confine the caller to public.current_org_id() and take the
-- caller's role from Membership (public.current_user_role()), never
-- from Profile.role. This migration:
--
--   1. Rewrites the client-callable RPCs that were still on pre-SY22
--      bodies (or on SY22 shims that dropped business rules) so they
--      check company + Membership role, touch only that company's
--      rows, and stamp organizationId on every row they insert.
--   2. Drops the SY22 shim advance_order_status(text,"OrderStatus",text):
--      no client calls it and it set ANY status with no role check.
--   3. Locks down EXECUTE. Supabase grants EXECUTE on every new public
--      function straight to anon + authenticated (default privileges),
--      so the earlier `REVOKE ... FROM PUBLIC` lines never removed it:
--      every internal helper and trigger function was callable by
--      anyone holding the anon key. Now: revoke from PUBLIC / anon /
--      authenticated on ALL public functions, then grant back an
--      explicit allow-list, and change default privileges so future
--      functions start closed.
--   4. RLS: Device admin policies were cross-company (any company's
--      ADMIN could read/update every device); Profile had no way for
--      a company ADMIN to read their own team (mobile Team screen).
--   5. Adds get_management_summary() — the mobile command-centre totals
--      computed in SQL for the caller's company (no 1,000-row cap).
--
-- Function inventory (every function in public; verdicts):
--
--   SCOPED (company + Membership role checked here):
--     advance_order_status(text,text,text)   approve_order
--     reject_order                           cancel_own_order
--     approve_rate                           set_user_active
--     get_profile_directory                  revoke_device
--     replace_sales_order_items              create_sales_order (v1, web)
--     create_sales_order_v2 (SY22; numbering now via _next_order_number)
--     get_management_summary (new)
--   SAFE BY DESIGN (act only on the caller's own rows / own context):
--     current_org_id  current_user_role  current_device_ok
--     current_org_status  current_org_writable (SY28)
--     register_device  touch_device_seen
--     count_active_recovery_codes  rotate_recovery_codes
--   REVOKED from anon + authenticated (server / service_role only):
--     consume_recovery_code (takes any profile id; server-only)
--     check_order_create_rate_limit  check_document_upload_rate_limit
--     check_phone_otp_rate_limit  check_email_otp_send_limit
--     record_phone_otp_attempt  is_provisioned_phone
--     is_notification_config_ready
--     _dispatch_notification  _recompute_dispatch_status
--     _sweep_stale_orders  *_recompute_party_outstanding
--     _next_order_number (new, internal)
--     every trigger function (triggers fire regardless of EXECUTE)
--   DROPPED:
--     advance_order_status(text,"OrderStatus",text)  (this migration)
--     issue_enrollment_code  redeem_enrollment_code
--     redeem_and_mint_session (20260828060000_email_otp_signin)
--   UNTOUCHED: rls_auto_enable (Supabase-managed event trigger)
--
-- create_sales_order (v1) is NOT revoked: mobile only calls v2, but the
-- web order form still calls v1 (app/(dashboard)/orders/actions.ts),
-- and v1 carries the credit-limit / approval-mode / floor-rate rules
-- v2 lacks. It is rewritten company-scoped instead.

-- ─────────────────────────────────────────────────────────────────
-- 0. Internal: per-company order number (shared by v1 and v2).
--
-- Keyed by financial-year start (Apr–Mar) and never below the highest
-- number already used in that company+FY, so v1, v2 and any legacy
-- rows can't collide. (v2 used to key by calendar year while labelling
-- by FY, which would restart at 0001 every January.)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._next_order_number(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_fy_year int;
  v_prefix  text;
  v_max     int;
  v_seq     int;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'No active organization';
  END IF;
  IF EXTRACT(MONTH FROM CURRENT_DATE)::int >= 4 THEN
    v_fy_year := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  ELSE
    v_fy_year := EXTRACT(YEAR FROM CURRENT_DATE)::int - 1;
  END IF;
  v_prefix := 'SB/' || lpad((v_fy_year % 100)::text, 2, '0') || '-'
                    || lpad(((v_fy_year + 1) % 100)::text, 2, '0') || '/';

  PERFORM pg_advisory_xact_lock(hashtext(p_org::text || ':' || v_prefix));

  SELECT COALESCE(MAX(substring("orderNumber" FROM length(v_prefix) + 1)::int), 0)
    INTO v_max
    FROM "SalesOrder"
   WHERE "organizationId" = p_org
     AND "orderNumber" LIKE v_prefix || '%'
     AND substring("orderNumber" FROM length(v_prefix) + 1) ~ '^[0-9]+$';

  INSERT INTO "OrgNumberSequence" ("organizationId", kind, year, seq, "updatedAt")
  VALUES (p_org, 'ORDER', v_fy_year, v_max + 1, now())
  ON CONFLICT ("organizationId", kind, year)
    DO UPDATE SET seq = GREATEST("OrgNumberSequence".seq + 1, EXCLUDED.seq),
                  "updatedAt" = now()
  RETURNING seq INTO v_seq;

  RETURN v_prefix || lpad(v_seq::text, 4, '0');
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 1. advance_order_status(text, text, text) — the overload web and
--    mobile call. Pre-SY22 transition rules + company + Membership role.
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.advance_order_status(text, "OrderStatus", text);

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
  v_uid     uuid := auth.uid();
  v_org     uuid := public.current_org_id();
  v_role    text := public.current_user_role();
  v_order   "SalesOrder"%ROWTYPE;
  v_target  "OrderStatus";
  v_allowed boolean := false;
  v_note    text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('FACTORY', 'ADMIN') THEN
    RAISE EXCEPTION 'Only FACTORY or ADMIN may advance order status';
  END IF;

  BEGIN
    v_target := p_target::"OrderStatus";
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid target status: %', p_target;
  END;

  SELECT * INTO v_order FROM "SalesOrder"
   WHERE id = p_order_id AND "organizationId" = v_org;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF v_order."needsRateApproval" = true THEN
    RAISE EXCEPTION 'This order is awaiting admin rate approval and cannot be advanced';
  END IF;
  IF v_order."currentStatus" IN ('PENDING_APPROVAL', 'REJECTED') THEN
    RAISE EXCEPTION 'This order is % — approve or reject it first', v_order."currentStatus";
  END IF;
  IF v_order."currentStatus" = v_target THEN
    RAISE EXCEPTION 'Order is already in status %', v_target;
  END IF;

  IF v_target = 'CANCELLED' THEN
    IF v_order."currentStatus" IN ('DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED') THEN
      RAISE EXCEPTION 'Cannot cancel an order that is already %', v_order."currentStatus";
    END IF;
    v_allowed := true;
  ELSIF v_order."currentStatus" = 'ORDER_PLACED'      AND v_target = 'IN_PRODUCTION'     THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'IN_PRODUCTION'     AND v_target = 'READY_TO_DISPATCH' THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'READY_TO_DISPATCH' AND v_target = 'LR_GENERATED'      THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'LR_GENERATED'      AND v_target = 'DISPATCHED'        THEN v_allowed := true;
  ELSIF v_order."currentStatus" = 'DISPATCHED'        AND v_target = 'DELIVERED'         THEN v_allowed := true;
  END IF;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Cannot advance status % → % (backwards or skip)', v_order."currentStatus", v_target;
  END IF;

  v_note := COALESCE(NULLIF(btrim(p_note), ''), 'Status advanced');

  UPDATE "SalesOrder"
     SET "currentStatus" = v_target,
         "deliveredAt"   = CASE WHEN v_target = 'DELIVERED' AND "deliveredAt" IS NULL
                                THEN now() ELSE "deliveredAt" END,
         "updatedAt"     = now()
   WHERE id = v_order.id AND "organizationId" = v_org;

  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_order.id, v_target, left(v_note, 1000), v_uid, now(), v_org);

  RETURN QUERY SELECT v_order.id, v_target::text;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. approve_order / reject_order — pre-SY22 status rules restored
--    (SY22's shim approved/rejected an order in ANY status), plus
--    company + Membership role. Signatures/returns kept as live (void).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_order(
  p_order_id text,
  p_note     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_org   uuid := public.current_org_id();
  v_order "SalesOrder"%ROWTYPE;
  v_note  text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF public.current_user_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may approve orders';
  END IF;

  SELECT * INTO v_order FROM "SalesOrder"
   WHERE id = p_order_id AND "organizationId" = v_org;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  v_note := COALESCE(NULLIF(btrim(p_note), ''), 'Order approved');

  IF v_order."currentStatus" = 'PENDING_APPROVAL' THEN
    UPDATE "SalesOrder"
       SET "currentStatus"     = 'ORDER_PLACED',
           "approvedById"      = v_uid,
           "approvedAt"        = now(),
           "needsRateApproval" = false,
           "rateApprovedById"  = v_uid,
           "rateApprovedAt"    = now(),
           "rateApprovalNote"  = v_note,
           "updatedAt"         = now()
     WHERE id = v_order.id AND "organizationId" = v_org;
    INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
    VALUES (replace(gen_random_uuid()::text, '-', ''), v_order.id, 'ORDER_PLACED',
            '[APPROVED] ' || left(v_note, 900), v_uid, now(), v_org);
  ELSIF v_order."needsRateApproval" = true
     AND v_order."currentStatus" NOT IN ('REJECTED', 'CANCELLED') THEN
    UPDATE "SalesOrder"
       SET "needsRateApproval" = false,
           "rateApprovedById"  = v_uid,
           "rateApprovedAt"    = now(),
           "rateApprovalNote"  = v_note,
           "approvedById"      = v_uid,
           "approvedAt"        = now(),
           "updatedAt"         = now()
     WHERE id = v_order.id AND "organizationId" = v_org;
    INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
    VALUES (replace(gen_random_uuid()::text, '-', ''), v_order.id, v_order."currentStatus",
            '[APPROVED] ' || left(v_note, 900), v_uid, now(), v_org);
  ELSE
    RAISE EXCEPTION 'Order is %, not awaiting approval', v_order."currentStatus";
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order(
  p_order_id text,
  p_reason   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org    uuid := public.current_org_id();
  v_order  "SalesOrder"%ROWTYPE;
  v_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF public.current_user_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may reject orders';
  END IF;
  v_reason := NULLIF(btrim(p_reason), '');
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Rejection reason is required'; END IF;

  SELECT * INTO v_order FROM "SalesOrder"
   WHERE id = p_order_id AND "organizationId" = v_org;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order."currentStatus" <> 'PENDING_APPROVAL'
     AND NOT (v_order."needsRateApproval" = true
              AND v_order."currentStatus" NOT IN ('REJECTED', 'CANCELLED')) THEN
    RAISE EXCEPTION 'Order is %, not awaiting approval', v_order."currentStatus";
  END IF;

  UPDATE "SalesOrder"
     SET "currentStatus"   = 'REJECTED',
         "rejectedById"    = v_uid,
         "rejectedAt"      = now(),
         "rejectionReason" = left(v_reason, 1000),
         "updatedAt"       = now()
   WHERE id = v_order.id AND "organizationId" = v_org;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_order.id, 'REJECTED',
          '[REJECTED] ' || left(v_reason, 900), v_uid, now(), v_org);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3. cancel_own_order — pre-SY22 rules (reason required, cancellable
--    statuses, STAFF own orders only) + company.
-- ─────────────────────────────────────────────────────────────────

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
  v_uid    uuid := auth.uid();
  v_org    uuid := public.current_org_id();
  v_role   text := public.current_user_role();
  v_order  "SalesOrder"%ROWTYPE;
  v_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only the salesperson or an admin may cancel';
  END IF;

  v_reason := left(btrim(COALESCE(p_reason, '')), 1000);
  IF length(v_reason) = 0 THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;

  SELECT * INTO v_order FROM "SalesOrder"
   WHERE id = p_order_id AND "organizationId" = v_org;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_role = 'STAFF' AND v_order."salespersonId" IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'You can only cancel orders you placed';
  END IF;
  IF v_order."currentStatus" NOT IN
     ('ORDER_PLACED', 'PENDING_APPROVAL', 'IN_PRODUCTION', 'ON_HOLD', 'READY_TO_DISPATCH') THEN
    RAISE EXCEPTION 'Order in status % cannot be cancelled from the app', v_order."currentStatus";
  END IF;

  UPDATE "SalesOrder"
     SET "currentStatus" = 'CANCELLED', "updatedAt" = now()
   WHERE id = v_order.id AND "organizationId" = v_org;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_order.id, 'CANCELLED',
          '[CANCELLED BY ' || v_role || '] ' || v_reason, v_uid, now(), v_org);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. approve_rate
-- ─────────────────────────────────────────────────────────────────

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
  v_uid   uuid := auth.uid();
  v_org   uuid := public.current_org_id();
  v_order "SalesOrder"%ROWTYPE;
  v_note  text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization' USING ERRCODE = '42501'; END IF;
  IF public.current_user_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may approve rate exceptions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM "SalesOrder"
   WHERE id = p_order_id AND "organizationId" = v_org;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order."needsRateApproval" = false THEN
    RAISE EXCEPTION 'This order does not need rate approval';
  END IF;

  v_note := COALESCE(NULLIF(btrim(p_note), ''), 'Rate approved');

  UPDATE "SalesOrder"
     SET "needsRateApproval" = false,
         "rateApprovedById"  = v_uid,
         "rateApprovedAt"    = now(),
         "rateApprovalNote"  = left(v_note, 1000),
         "updatedAt"         = now()
   WHERE id = v_order.id AND "organizationId" = v_org;
  UPDATE "SalesOrderItem"
     SET "needsRateApproval" = false,
         "rateApprovedById"  = v_uid,
         "rateApprovedAt"    = now(),
         "rateApprovalNote"  = left(v_note, 1000),
         "updatedAt"         = now()
   WHERE "salesOrderId" = v_order.id
     AND "organizationId" = v_org
     AND "needsRateApproval" = true;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_order.id, v_order."currentStatus",
          '[RATE APPROVED] ' || left(v_note, 500), v_uid, now(), v_org);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. set_user_active — toggles the target's Membership in the
--    caller's company (Profile.isActive follows via the
--    sync_profile_from_membership trigger, so other companies keep
--    their access). Last-active-manager guard counts THIS company.
-- ─────────────────────────────────────────────────────────────────

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
  v_uid    uuid := auth.uid();
  v_org    uuid := public.current_org_id();
  v_member "Membership"%ROWTYPE;
  v_others int;
  v_note   text;
  v_name   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization' USING ERRCODE = '42501'; END IF;
  IF public.current_user_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may change user status' USING ERRCODE = '42501';
  END IF;
  IF v_uid = p_target AND p_active = false THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  SELECT * INTO v_member FROM "Membership"
   WHERE "profileId" = p_target AND "organizationId" = v_org;
  IF v_member.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_member."isActive" = p_active THEN
    RAISE EXCEPTION 'User is already %', CASE WHEN p_active THEN 'active' ELSE 'deactivated' END;
  END IF;

  IF p_active = false AND v_member.role = 'ADMIN' THEN
    SELECT count(*) INTO v_others
      FROM "Membership" m JOIN "Profile" p ON p.id = m."profileId"
     WHERE m."organizationId" = v_org
       AND m.role = 'ADMIN'
       AND m."isActive" = true
       AND p."isActive" = true
       AND m."profileId" <> p_target;
    IF v_others = 0 THEN
      RAISE EXCEPTION 'Refusing to deactivate the last active ADMIN. Promote someone else first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT "ownerName" INTO v_name FROM "Profile" WHERE id = v_uid;
  v_note := COALESCE(NULLIF(btrim(p_note), ''), 'by ' || COALESCE(v_name, 'admin'));

  UPDATE "Membership" SET "isActive" = p_active WHERE id = v_member.id;

  -- Stamp who/when only when this was the person's last company.
  IF NOT EXISTS (SELECT 1 FROM "Membership"
                  WHERE "profileId" = p_target AND "isActive" = true) THEN
    UPDATE "Profile"
       SET "deactivatedAt"   = CASE WHEN p_active THEN NULL ELSE now() END,
           "deactivatedById" = CASE WHEN p_active THEN NULL ELSE v_uid END,
           "updatedAt"       = now()
     WHERE id = p_target;
  ELSIF p_active THEN
    UPDATE "Profile" SET "deactivatedAt" = NULL, "deactivatedById" = NULL, "updatedAt" = now()
     WHERE id = p_target;
  END IF;

  INSERT INTO "UserAuditLog" (id, "actorId", "targetProfileId", action, detail, "createdAt", "organizationId")
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_uid, p_target,
          CASE WHEN p_active THEN 'ACTIVATED' ELSE 'DEACTIVATED' END::"UserAuditAction",
          left(v_note, 1000), now(), v_org);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. get_profile_directory — members of the caller's company only,
--    with their role IN THIS company. Same columns as before.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_profile_directory()
RETURNS TABLE (id uuid, "ownerName" text, role text, phone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p."ownerName", m.role::text, p.phone
    FROM "Membership" m
    JOIN "Profile" p ON p.id = m."profileId"
   WHERE m."organizationId" = public.current_org_id()
     AND m."isActive" = true
     AND p."isActive" = true
     AND public.current_user_role() IN ('ADMIN', 'FACTORY');
$$;

-- ─────────────────────────────────────────────────────────────────
-- 7. revoke_device — ADMIN of the company, device owner must be a
--    member of that company.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_device(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org    uuid := public.current_org_id();
  v_device "Device"%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF public.current_user_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may revoke devices';
  END IF;

  SELECT d.* INTO v_device
    FROM "Device" d
   WHERE d.id = p_device_id
     AND EXISTS (SELECT 1 FROM "Membership" m
                  WHERE m."profileId" = d."profileId" AND m."organizationId" = v_org);
  IF v_device.id IS NULL THEN RAISE EXCEPTION 'Device not found'; END IF;
  IF v_device."revokedAt" IS NOT NULL THEN RETURN; END IF;

  UPDATE "Device" SET "revokedAt" = now(), "revokedById" = v_uid WHERE id = v_device.id;
  INSERT INTO "UserAuditLog" (id, "actorId", "targetProfileId", action, detail, "createdAt", "organizationId")
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_uid, v_device."profileId",
          'DEVICE_REVOKED', v_device.label, now(), v_org);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 8. replace_sales_order_items — company-scoped order + products;
--    STAFF may edit only their own orders (matches the web rule).
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
  v_uid             uuid := auth.uid();
  v_org             uuid := public.current_org_id();
  v_role            text := public.current_user_role();
  v_name            text;
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only STAFF or ADMIN may edit order items';
  END IF;

  SELECT * INTO v_order FROM "SalesOrder"
   WHERE id = p_order_id AND "organizationId" = v_org;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_role = 'STAFF' AND v_order."salespersonId" IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'You can only edit your own orders';
  END IF;
  IF v_order."currentStatus" IN ('DISPATCHED','PARTIALLY_DISPATCHED','DELIVERED','CANCELLED','REJECTED') THEN
    RAISE EXCEPTION 'Cannot edit items on a % order', v_order."currentStatus";
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  CREATE TEMP TABLE _tmp_items (
    line_number int, product_id text, brand text, quantity numeric(10,3),
    quantity_unit text, packing_type text, size_kg text, product_rate text,
    line_value numeric(12,2)
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
      SELECT * INTO v_line_product FROM "Product"
       WHERE id = v_line_product_id AND "organizationId" = v_org;
      IF v_line_product.id IS NULL OR v_line_product."isActive" = false THEN
        RAISE EXCEPTION 'Line %: selected product is unavailable', v_line_number;
      END IF;
    ELSE
      v_prod_brand := COALESCE(NULLIF(btrim(v_item->>'brand'), ''), 'CUSTOM');
      SELECT * INTO v_line_product FROM "Product"
       WHERE lower(name) = lower(v_new_product) AND lower(brand) = lower(v_prod_brand)
         AND "isActive" = true AND "organizationId" = v_org
       ORDER BY "createdAt" ASC LIMIT 1;
      IF v_line_product.id IS NULL THEN
        INSERT INTO "Product" (id, name, brand, "isActive", "sortOrder", "createdAt", "organizationId")
        VALUES (replace(gen_random_uuid()::text, '-', ''), v_new_product, v_prod_brand, true, 9999, now(), v_org)
        RETURNING * INTO v_line_product;
      END IF;
    END IF;

    v_line_rate_num := COALESCE(NULLIF(regexp_replace(v_item->>'productRate', '[^0-9.\-]', '', 'g'), '')::numeric, 0);
    v_line_value := round(v_line_qty * v_line_rate_num, 2);
    INSERT INTO _tmp_items VALUES (
      v_line_number, v_line_product.id,
      COALESCE(NULLIF(btrim(v_item->>'brand'), ''), v_line_product.brand),
      v_line_qty, COALESCE(NULLIF(btrim(v_item->>'quantityUnit'), ''), 'PCS'),
      NULLIF(btrim(v_item->>'packingType'), ''), NULLIF(btrim(v_item->>'sizeKg'), ''),
      v_item->>'productRate', v_line_value
    );
    v_total := v_total + v_line_value;
  END LOOP;

  DELETE FROM "SalesOrderItem" WHERE "salesOrderId" = v_order.id AND "organizationId" = v_org;
  INSERT INTO "SalesOrderItem" (
    id, "salesOrderId", "productId", brand, quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "lineValue", "lineNumber", "needsRateApproval", "createdAt", "updatedAt", "organizationId"
  )
  SELECT replace(gen_random_uuid()::text, '-', ''), v_order.id, ti.product_id, ti.brand,
         ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg, ti.product_rate,
         ti.line_value, ti.line_number, false, now(), now(), v_org
    FROM _tmp_items ti ORDER BY ti.line_number;

  SELECT "ownerName" INTO v_name FROM "Profile" WHERE id = v_uid;
  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (
    replace(gen_random_uuid()::text, '-', ''), v_order.id, v_order."currentStatus",
    format('Line items edited by %s (%s line%s, total %s)', v_name, v_line_number,
           CASE WHEN v_line_number = 1 THEN '' ELSE 's' END, to_char(v_total, 'FM999,999,990.00')),
    v_uid, now(), v_org
  );

  RETURN QUERY SELECT v_order.id, v_total::numeric;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 9. create_sales_order (v1, used by the web order form) — same rules
--    as 20260821210000 (credit limit, approval mode, floor rate, admin
--    self-approve) but: role from Membership, customer/product must be
--    in the caller's company, approval mode from THAT company's
--    BusinessSettings, per-company numbering, organizationId stamped.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_sales_order(
  p_party_id               text,
  p_product_id             text,
  p_brand                  text,
  p_quantity               numeric,
  p_quantity_unit          text,
  p_packing_type           text,
  p_size_kg                text,
  p_product_rate           text,
  p_payment_term           text,
  p_transport_type         text,
  p_expected_delivery_date date,
  p_token_type             text,
  p_notes                  text,
  p_new_customer_name      text DEFAULT NULL,
  p_dispatch_location      text DEFAULT NULL,
  p_new_product_name       text DEFAULT NULL,
  p_credit_override_note   text DEFAULT NULL
)
RETURNS TABLE (id text, "orderNumber" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid              uuid := auth.uid();
  v_org              uuid := public.current_org_id();
  v_role             text := public.current_user_role();
  v_product          "Product"%ROWTYPE;
  v_party            "Party"%ROWTYPE;
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
  v_over_limit       boolean := false;
  v_is_new_customer  boolean := false;
  v_mode             "OrderApprovalMode";
  v_initial_status   "OrderStatus";
  v_seed_note        text;
  v_rate_approved_by uuid        := NULL;
  v_rate_approved_at timestamptz := NULL;
  v_rate_note        text        := NULL;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only STAFF or ADMIN may create sales orders';
  END IF;

  SELECT limited INTO v_limited FROM public.check_order_create_rate_limit(v_uid);
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
    SELECT * INTO v_party FROM "Party" WHERE id = p_party_id AND "organizationId" = v_org;
    IF v_party.id IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;
    IF v_role = 'STAFF' AND v_party."assignedToId" IS NOT NULL AND v_party."assignedToId" <> v_uid THEN
      RAISE EXCEPTION 'This customer is assigned to another salesperson';
    END IF;
  END IF;
  v_is_new_customer := (v_party.id IS NULL);

  IF p_product_id IS NOT NULL AND p_product_id <> '' THEN
    SELECT * INTO v_product FROM "Product" WHERE id = p_product_id AND "organizationId" = v_org;
    IF v_product.id IS NULL OR v_product."isActive" = false THEN
      RAISE EXCEPTION 'Selected product is unavailable';
    END IF;
  ELSE
    v_prod_brand := COALESCE(NULLIF(btrim(p_brand), ''), 'CUSTOM');
    SELECT * INTO v_product FROM "Product"
     WHERE lower(name) = lower(v_new_product) AND lower(brand) = lower(v_prod_brand)
       AND "isActive" = true AND "organizationId" = v_org
     ORDER BY "createdAt" ASC LIMIT 1;
    IF v_product.id IS NULL THEN
      INSERT INTO "Product" (id, name, brand, "isActive", "sortOrder", "createdAt", "organizationId")
      VALUES (replace(gen_random_uuid()::text, '-', ''), v_new_product, v_prod_brand, true, 9999, now(), v_org)
      RETURNING * INTO v_product;
    END IF;
  END IF;

  v_rate_num := COALESCE(NULLIF(regexp_replace(p_product_rate, '[^0-9.\-]', '', 'g'), '')::numeric, 0);
  v_value := round(p_quantity * v_rate_num, 2);

  IF v_product."floorRate" IS NOT NULL AND v_rate_num > 0 AND v_rate_num < v_product."floorRate" THEN
    v_needs_approv := true;
  END IF;

  SELECT "orderApprovalMode" INTO v_mode FROM "BusinessSettings" WHERE "organizationId" = v_org;
  IF v_mode IS NULL THEN v_mode := 'EXCEPTIONS_ONLY'; END IF;

  IF v_party.id IS NOT NULL AND v_party."creditLimit" IS NOT NULL
     AND COALESCE(v_party."totalOutstanding", 0) + v_value > v_party."creditLimit" THEN
    v_over_limit := true;
  END IF;

  IF v_over_limit THEN
    IF v_role = 'ADMIN' THEN
      IF NULLIF(btrim(p_credit_override_note), '') IS NULL THEN
        RAISE EXCEPTION 'Override note required to place this order past the credit limit.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_credit_passed := false;
      v_override_by   := v_uid;
      v_override_note := btrim(p_credit_override_note);
    ELSE
      IF v_mode = 'NONE' THEN
        RAISE EXCEPTION 'Credit limit would be exceeded — ask an admin to review, or collect outstanding first.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_credit_passed := false;
    END IF;
  END IF;

  IF v_role = 'ADMIN' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSIF v_mode = 'NONE' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSIF v_mode = 'ALL' THEN
    v_initial_status := 'PENDING_APPROVAL';
  ELSIF v_needs_approv OR v_over_limit OR v_is_new_customer THEN
    v_initial_status := 'PENDING_APPROVAL';
  ELSE
    v_initial_status := 'ORDER_PLACED';
  END IF;

  v_number := public._next_order_number(v_org);
  v_id := replace(gen_random_uuid()::text, '-', '');

  v_seed_note := CASE v_initial_status
    WHEN 'PENDING_APPROVAL' THEN 'Order placed — awaiting admin approval'
    ELSE 'Order placed' END;
  IF v_needs_approv THEN v_seed_note := v_seed_note || ' (below floor rate)'; END IF;
  IF v_over_limit THEN
    v_seed_note := v_seed_note || CASE WHEN v_role = 'ADMIN'
      THEN ' — credit override by admin: ' || v_override_note
      ELSE ' (over credit limit)' END;
  END IF;
  IF v_is_new_customer THEN v_seed_note := v_seed_note || ' (new customer)'; END IF;

  IF v_role = 'ADMIN' AND v_needs_approv THEN
    v_rate_approved_by := v_uid;
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
    "createdAt", "updatedAt", "organizationId"
  ) VALUES (
    v_id, v_number, NULLIF(p_party_id, ''), v_new_name,
    v_uid, v_product.id, COALESCE(p_brand, v_product.brand),
    p_quantity, p_quantity_unit, p_packing_type, p_size_kg,
    p_product_rate, v_value,
    p_payment_term, p_transport_type, p_expected_delivery_date,
    NULLIF(btrim(p_dispatch_location), ''), NULLIF(btrim(p_token_type), ''),
    NULLIF(btrim(p_notes), ''), v_initial_status,
    v_credit_passed, v_override_by, v_override_note,
    v_needs_approv,
    v_rate_approved_by, v_rate_approved_at, v_rate_note,
    now(), now(), v_org
  );

  INSERT INTO "OrderStatusEvent" (id, "salesOrderId", status, notes, "updatedById", "createdAt", "organizationId")
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_id, v_initial_status, v_seed_note, v_uid, now(), v_org);

  RETURN QUERY SELECT v_id, v_number;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 10. create_sales_order_v2 (mobile) — unchanged from SY22 except the
--     order number now comes from _next_order_number().
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_sales_order_v2(
  p_header jsonb,
  p_items  jsonb
)
RETURNS TABLE (id text, "orderNumber" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_profile         "Profile"%ROWTYPE;
  v_org             uuid;
  v_party           "Party"%ROWTYPE;
  v_party_id        text;
  v_new_name        text;
  v_limited         boolean;
  v_total_value     numeric(12,2) := 0;
  v_fy_start        int;
  v_fy_end          int;
  v_fy_label        text;
  v_prefix          text;
  v_seq             int;
  v_number          text;
  v_id              text;
  v_initial_status  "OrderStatus";
  v_seed_note       text;
  v_item            jsonb;
  v_line_number     int := 0;
  v_line_qty        numeric;
  v_line_rate_num   numeric;
  v_line_value      numeric(12,2);
  v_line_product    "Product"%ROWTYPE;
  v_line_product_id text;
  v_new_product     text;
  v_prod_brand      text;
  v_is_new_customer boolean := false;
  v_role            text;
BEGIN
  SELECT * INTO v_profile FROM "Profile" WHERE id = auth.uid();
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_org := public.current_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active organization';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account disabled';
  END IF;
  IF v_role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Only STAFF or ADMIN may create sales orders';
  END IF;

  SELECT limited INTO v_limited
    FROM public.check_order_create_rate_limit(v_profile.id);
  IF v_limited THEN
    RAISE EXCEPTION 'Too many orders in the last hour. Try again shortly.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_party_id := NULLIF(btrim(p_header->>'partyId'), '');
  v_new_name := NULLIF(btrim(p_header->>'newCustomerName'), '');

  IF v_party_id IS NULL AND v_new_name IS NULL THEN
    RAISE EXCEPTION 'Provide either an existing customer or a new customer name';
  END IF;
  IF v_party_id IS NOT NULL AND v_new_name IS NOT NULL THEN
    RAISE EXCEPTION 'Provide only one of partyId or newCustomerName';
  END IF;

  IF v_party_id IS NOT NULL THEN
    SELECT * INTO v_party FROM "Party" WHERE id = v_party_id;
    IF v_party.id IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_party."organizationId" IS DISTINCT FROM v_org THEN
      -- Cross-org customer id would leak visibility; deny.
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_role = 'STAFF'
       AND v_party."assignedToId" IS NOT NULL
       AND v_party."assignedToId" <> v_profile.id THEN
      RAISE EXCEPTION 'This customer is assigned to another salesperson';
    END IF;
  END IF;
  v_is_new_customer := (v_party.id IS NULL);

  CREATE TEMP TABLE _tmp_items (
    line_number    int,
    product_id     text,
    brand          text,
    quantity       numeric(10,3),
    quantity_unit  text,
    packing_type   text,
    size_kg        text,
    product_rate   text,
    line_value     numeric(12,2)
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
      IF v_line_product."organizationId" IS DISTINCT FROM v_org THEN
        RAISE EXCEPTION 'Line %: selected product is unavailable', v_line_number;
      END IF;
    ELSE
      v_prod_brand := COALESCE(NULLIF(btrim(v_item->>'brand'), ''), 'CUSTOM');
      SELECT * INTO v_line_product
        FROM "Product"
       WHERE lower(name) = lower(v_new_product)
         AND lower(brand) = lower(v_prod_brand)
         AND "isActive" = true
         AND "organizationId" = v_org
       ORDER BY "createdAt" ASC
       LIMIT 1;
      IF v_line_product.id IS NULL THEN
        INSERT INTO "Product" (id, name, brand, "isActive", "sortOrder", "createdAt", "organizationId")
        VALUES (
          replace(gen_random_uuid()::text, '-', ''),
          v_new_product, v_prod_brand, true, 9999, now(), v_org
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

    v_total_value := v_total_value + v_line_value;
  END LOOP;

  IF v_role = 'ADMIN' THEN
    v_initial_status := 'ORDER_PLACED';
  ELSE
    v_initial_status := 'PENDING_APPROVAL';
  END IF;

  -- SY33 — shared per-company, per-financial-year numbering.
  v_number := public._next_order_number(v_org);
  v_id     := replace(gen_random_uuid()::text, '-', '');

  v_seed_note := CASE v_initial_status
    WHEN 'PENDING_APPROVAL' THEN 'Order placed — awaiting admin approval'
    ELSE 'Order placed'
  END;
  IF v_is_new_customer THEN
    v_seed_note := v_seed_note || ' (new customer)';
  END IF;

  INSERT INTO "SalesOrder" (
    id, "orderNumber", "partyId", "newCustomerName",
    "salespersonId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "orderValue",
    "paymentTerm", "transportType", "expectedDeliveryDate",
    "dispatchLocation", "tokenType",
    notes, "currentStatus",
    "creditCheckPassed",
    "needsRateApproval",
    "createdAt", "updatedAt",
    "organizationId"
  )
  SELECT
    v_id, v_number,
    v_party_id, v_new_name,
    v_profile.id, ti.product_id, ti.brand,
    ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg,
    ti.product_rate, v_total_value,
    NULLIF(btrim(p_header->>'paymentTerm'), ''),
    NULLIF(btrim(p_header->>'transportType'), ''),
    NULLIF(p_header->>'expectedDeliveryDate', '')::date,
    NULLIF(btrim(p_header->>'dispatchLocation'), ''),
    NULLIF(btrim(p_header->>'tokenType'), ''),
    NULLIF(btrim(p_header->>'notes'), ''), v_initial_status,
    true,
    false,
    now(), now(),
    v_org
  FROM _tmp_items ti WHERE ti.line_number = 1;

  INSERT INTO "SalesOrderItem" (
    id, "salesOrderId", "productId", brand,
    quantity, "quantityUnit", "packingType", "sizeKg",
    "productRate", "lineValue", "lineNumber",
    "needsRateApproval",
    "createdAt", "updatedAt",
    "organizationId"
  )
  SELECT
    replace(gen_random_uuid()::text, '-', ''),
    v_id, ti.product_id, ti.brand,
    ti.quantity, ti.quantity_unit, ti.packing_type, ti.size_kg,
    ti.product_rate, ti.line_value, ti.line_number,
    false,
    now(), now(),
    v_org
  FROM _tmp_items ti
  ORDER BY ti.line_number;

  INSERT INTO "OrderStatusEvent" (
    id, "salesOrderId", status, notes, "updatedById", "createdAt",
    "organizationId"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_id, v_initial_status, v_seed_note, v_profile.id, now(),
    v_org
  );

  RETURN QUERY SELECT v_id, v_number;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 11. get_management_summary() — mobile command-centre totals for the
--     caller's company, computed in SQL (the app used to download every
--     Party / Payment / SalesOrder row, silently capped at 1,000).
--
--     Day / week (Sunday start) / month boundaries are in the company's
--     BusinessSettings.timezone (default Asia/Kolkata). Timestamps are
--     stored as UTC `timestamp without time zone`.
--
--     DSO (days sales outstanding) = total outstanding ÷ value invoiced
--     in the last 90 days × 90. NULL when nothing was invoiced.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_management_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org          uuid := public.current_org_id();
  v_tz           text;
  v_local        timestamp;
  v_today        timestamp;
  v_week         timestamp;
  v_month        timestamp;
  v_next_month   timestamp;
  v_last_month   timestamp;
  v_outstanding  numeric;
  v_invoiced_90d numeric;
  v_result       jsonb;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;
  IF public.current_user_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may view the management summary';
  END IF;

  SELECT COALESCE(NULLIF(timezone, ''), 'Asia/Kolkata') INTO v_tz
    FROM "BusinessSettings" WHERE "organizationId" = v_org;
  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  -- Local wall-clock boundaries → UTC timestamps for comparison.
  v_local      := now() AT TIME ZONE v_tz;
  v_today      := (date_trunc('day', v_local)) AT TIME ZONE v_tz AT TIME ZONE 'UTC';
  v_week       := (date_trunc('day', v_local) - make_interval(days => EXTRACT(DOW FROM v_local)::int))
                    AT TIME ZONE v_tz AT TIME ZONE 'UTC';
  v_month      := (date_trunc('month', v_local)) AT TIME ZONE v_tz AT TIME ZONE 'UTC';
  v_next_month := (date_trunc('month', v_local) + interval '1 month') AT TIME ZONE v_tz AT TIME ZONE 'UTC';
  v_last_month := (date_trunc('month', v_local) - interval '1 month') AT TIME ZONE v_tz AT TIME ZONE 'UTC';

  SELECT COALESCE(sum("totalOutstanding"), 0) INTO v_outstanding
    FROM "Party" WHERE "organizationId" = v_org;

  SELECT COALESCE(sum("totalAmount"), 0) INTO v_invoiced_90d
    FROM "Invoice"
   WHERE "organizationId" = v_org
     AND status <> 'CANCELLED'
     AND "invoiceDate" >= (now() AT TIME ZONE 'UTC') - interval '90 days';

  SELECT jsonb_build_object(
    'totalOutstanding',     round(v_outstanding, 2),
    'overdueInvoicesCount', (SELECT count(*) FROM "Invoice"
                              WHERE "organizationId" = v_org AND status = 'OVERDUE'),
    'overdueAmount',        (SELECT COALESCE(sum("totalAmount" - "paidAmount" - "creditedAmount"), 0)
                               FROM "Invoice"
                              WHERE "organizationId" = v_org AND status = 'OVERDUE'),
    'collectedThisMonth',   (SELECT COALESCE(sum(amount), 0) FROM "Payment"
                              WHERE "organizationId" = v_org
                                AND "paymentDate" >= v_month AND "paymentDate" < v_next_month),
    'dsoDays',              CASE WHEN v_invoiced_90d > 0
                                 THEN round(v_outstanding / v_invoiced_90d * 90) END,
    'placedTodayCount',     (SELECT count(*) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "createdAt" >= v_today),
    'placedTodayValue',     (SELECT COALESCE(sum("orderValue"), 0) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "createdAt" >= v_today),
    'placedWeekCount',      (SELECT count(*) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "createdAt" >= v_week),
    'placedWeekValue',      (SELECT COALESCE(sum("orderValue"), 0) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "createdAt" >= v_week),
    'pendingApproval',      (SELECT count(*) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "currentStatus" = 'PENDING_APPROVAL'),
    'rateApproval',         (SELECT count(*) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "needsRateApproval" = true),
    'overdueOrders',        (SELECT count(*) FROM "SalesOrder"
                              WHERE "organizationId" = v_org
                                AND "expectedDeliveryDate" < v_today
                                AND "currentStatus" NOT IN ('DISPATCHED','DELIVERED','CANCELLED','REJECTED')),
    'onHoldTotal',          (SELECT count(*) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "currentStatus" = 'ON_HOLD'),
    'onHoldByReason',       (SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'count', n)
                                                       ORDER BY n DESC), '[]'::jsonb)
                               FROM (SELECT "holdReasonCategory"::text AS category, count(*) AS n
                                       FROM "SalesOrder"
                                      WHERE "organizationId" = v_org AND "currentStatus" = 'ON_HOLD'
                                      GROUP BY 1) h),
    'dispatchedThisMonth',  (SELECT COALESCE(sum("orderValue"), 0) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "currentStatus" = 'DISPATCHED'
                                AND "createdAt" >= v_month AND "createdAt" < v_next_month),
    'dispatchedLastMonth',  (SELECT COALESCE(sum("orderValue"), 0) FROM "SalesOrder"
                              WHERE "organizationId" = v_org AND "currentStatus" = 'DISPATCHED'
                                AND "createdAt" >= v_last_month AND "createdAt" < v_month)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 12. RLS gaps on tables outside the SY22 tenant loop.
--
--   Device: the admin policies allowed ANY company's ADMIN to read and
--   update every device. Scope them to devices whose owner is a member
--   of the admin's current company.
--   Profile: only "own row" existed, so the mobile Team screen showed an
--   ADMIN just themselves. Add: ADMIN reads profiles of members of
--   their current company. Nothing else changes (no cross-company read).
--
--   Verified (no change needed): Membership (own rows + same-company
--   ADMIN), Organization (member of), PushToken (own), LoginAttempt,
--   RecoveryCode, TallyConnector, TallyPairingCode, SignupAttempt,
--   EmailOtpSendLog (RLS on, no policies → no client access),
--   BillingInvoice/BillingEvent/BillingSequence (SY28: RLS on).
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS device_select_admin ON "Device";
DROP POLICY IF EXISTS device_update_admin ON "Device";

CREATE POLICY device_select_admin ON "Device"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND EXISTS (SELECT 1 FROM "Membership" m
                 WHERE m."profileId" = "Device"."profileId"
                   AND m."organizationId" = public.current_org_id())
  );

CREATE POLICY device_update_admin ON "Device"
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND EXISTS (SELECT 1 FROM "Membership" m
                 WHERE m."profileId" = "Device"."profileId"
                   AND m."organizationId" = public.current_org_id())
  )
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND EXISTS (SELECT 1 FROM "Membership" m
                 WHERE m."profileId" = "Device"."profileId"
                   AND m."organizationId" = public.current_org_id())
  );

DROP POLICY IF EXISTS profile_select_same_org_admin ON "Profile";
CREATE POLICY profile_select_same_org_admin ON "Profile"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'ADMIN'
    AND EXISTS (SELECT 1 FROM "Membership" m
                 WHERE m."profileId" = "Profile".id
                   AND m."organizationId" = public.current_org_id())
  );

-- ─────────────────────────────────────────────────────────────────
-- 13. EXECUTE lockdown. Revoke from PUBLIC / anon / authenticated on
--     every function in public (except extension- and Supabase-owned
--     ones), then grant back the allow-list. service_role keeps all.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  f record;
  has_auth_admin boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin');
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prorettype <> 'event_trigger'::regtype
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);

    -- Client-callable RPCs: signed-in users only.
    IF f.proname IN (
      'advance_order_status', 'approve_order', 'reject_order', 'cancel_own_order',
      'approve_rate', 'set_user_active', 'get_profile_directory', 'revoke_device',
      'replace_sales_order_items', 'create_sales_order', 'create_sales_order_v2',
      'get_management_summary', 'register_device', 'touch_device_seen',
      'count_active_recovery_codes', 'rotate_recovery_codes',
      'current_org_status', 'current_org_writable'
    ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;

    -- RLS / storage-policy helpers: policies are evaluated as the
    -- querying role, so both client roles must be able to call them.
    -- Each only describes the caller's own session (NULL for anon).
    IF f.proname IN ('current_org_id', 'current_user_role', 'current_device_ok') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    END IF;

    -- Login-flow helpers stay callable by Supabase Auth hooks, if any.
    IF has_auth_admin AND f.proname IN (
      'is_provisioned_phone', 'check_phone_otp_rate_limit',
      'record_phone_otp_attempt', 'check_email_otp_send_limit'
    ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO supabase_auth_admin', f.sig);
    END IF;
  END LOOP;
END;
$$;

-- Future functions created by the migration role start closed; each
-- migration must GRANT what it means to expose.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END;
$$;
