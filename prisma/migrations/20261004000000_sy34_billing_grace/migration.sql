-- SY34 — failed renewals get a 7-day grace period.
--
-- SY28 locked an org the moment a renewal failed. Now a failed charge
-- (subscription.pending / subscription.halted / payment.failed) moves a
-- paying org to PAST_DUE — still fully writable — and stamps when that
-- started. The billing cron locks it (read-only, never deleted) once it
-- has been PAST_DUE for 7 days. A successful charge clears it.
--
-- Cancellation now takes effect at the end of the paid period: the
-- webhook records cancelAtPeriodEnd and the cron locks the org once
-- currentPeriodEnd has passed.
--
-- Mobile reactivation (set_user_active) now respects the plan's seat
-- limit, like the web invite / reactivate actions already do.
--
-- No new tables → no RLS changes. Writes while LOCKED stay refused by
-- the SY28 RESTRICTIVE policies + guard_org_writable trigger; PAST_DUE
-- is deliberately not blocked.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "pastDueSince" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Organization_status_pastDueSince_idx"
  ON "Organization" (status, "pastDueSince");

-- ─────────────────────────────────────────────────────────────────
-- Seat limit in SQL for the one client path that adds an active user:
-- set_user_active(…, true) from the mobile Team screen. The web checks
-- lib/platform/billing.ts checkSeatAvailable(). Keep these numbers in
-- step with seatLimit in lib/plans.ts (a vitest asserts they match).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._plan_seat_limit(p_plan text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_plan
    WHEN 'STARTER'  THEN 5
    WHEN 'GROWTH'   THEN 20
    WHEN 'TRIAL'    THEN 20
    ELSE NULL            -- BUSINESS: unlimited
  END;
$$;

REVOKE EXECUTE ON FUNCTION public._plan_seat_limit(text) FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public._plan_seat_limit(text) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END;
$$;

-- set_user_active — SY33 body + the seat check above. CREATE OR REPLACE
-- keeps the SY33 grants (authenticated + service_role).
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
  v_plan   text;
  v_limit  int;
  v_used   int;
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

  -- SY34 — seat limit (mirrors seatLimit in lib/plans.ts; TRIAL gets
  -- Growth entitlements; BUSINESS is unlimited). Mobile reactivation
  -- must not get past the limit the web enforces.
  IF p_active THEN
    SELECT plan::text INTO v_plan FROM "Organization" WHERE id = v_org;
    v_limit := public._plan_seat_limit(v_plan);
    IF v_limit IS NOT NULL THEN
      SELECT count(*) INTO v_used
        FROM "Membership" m JOIN "Profile" p ON p.id = m."profileId"
       WHERE m."organizationId" = v_org AND m."isActive" = true AND p."isActive" = true;
      IF v_used >= v_limit THEN
        RAISE EXCEPTION 'Your plan allows % users. Upgrade in Settings → Billing to add more.', v_limit
          USING ERRCODE = 'check_violation';
      END IF;
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
