-- fix_digest_schema
--
-- issue_enrollment_code and redeem_enrollment_code call
-- `digest(text, text)` from pgcrypto. On Supabase, pgcrypto is
-- installed into the `extensions` schema, not `public`. Our
-- SECURITY DEFINER functions run with `SET search_path = public`
-- (an invariant enforced by SY7 db_hardening), so an unqualified
-- `digest(...)` fails at run time with
--   "function digest(text, unknown) does not exist"
--
-- Fix: qualify every call as `extensions.digest(...)`. Do NOT widen
-- the search_path — a compromised extensions schema could shadow
-- functions we call.

CREATE OR REPLACE FUNCTION public.issue_enrollment_code(
  p_profile_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        uuid;
  v_actor_role   text;
  v_target       "Profile"%ROWTYPE;
  v_alphabet     text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, no 0/O/I/1/L
  v_code         text := '';
  v_i            int;
  v_idx          int;
  v_hash         text;
  v_id           text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_actor_role := public.current_user_role();
  IF v_actor_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may issue enrollment codes';
  END IF;

  SELECT * INTO v_target FROM "Profile" WHERE id = p_profile_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;
  IF v_target."isActive" = false THEN
    RAISE EXCEPTION 'Target profile is deactivated';
  END IF;

  UPDATE "EnrollmentCode"
     SET "consumedAt" = now()
   WHERE "profileId" = p_profile_id
     AND "consumedAt" IS NULL;

  FOR v_i IN 1..8 LOOP
    v_idx := 1 + (floor(random() * length(v_alphabet)))::int;
    v_code := v_code || substr(v_alphabet, v_idx, 1);
  END LOOP;

  v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
  v_id := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO "EnrollmentCode" (
    id, "profileId", "codeHash", "issuedById", "expiresAt", "createdAt"
  ) VALUES (
    v_id, p_profile_id, v_hash, v_actor, now() + interval '30 minutes', now()
  );

  INSERT INTO "UserAuditLog" (
    id, "actorId", "targetProfileId", action, detail, "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_actor, p_profile_id, 'ENROLLMENT_CODE_ISSUED',
    'expires in 30 min', now()
  );

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_enrollment_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_enrollment_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_enrollment_code(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.redeem_enrollment_code(
  p_phone  text,
  p_code   text,
  p_device jsonb
)
RETURNS TABLE (profile_id uuid, device_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limited      boolean;
  v_hash         text;
  v_code_row     "EnrollmentCode"%ROWTYPE;
  v_profile      "Profile"%ROWTYPE;
  v_device_id    text;
  v_label        text;
  v_platform     text;
  v_os           text;
  v_app          text;
  c_generic      text := 'Enrollment failed. Ask your admin for a new code.';
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RAISE EXCEPTION '%', c_generic;
  END IF;

  SELECT limited INTO v_limited
  FROM public.check_phone_otp_rate_limit(p_phone);
  IF v_limited THEN
    RAISE EXCEPTION '%', c_generic;
  END IF;

  IF p_code IS NULL OR length(p_code) <> 8 THEN
    PERFORM public.record_phone_otp_attempt(p_phone, false);
    RAISE EXCEPTION '%', c_generic;
  END IF;

  v_hash := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');

  SELECT ec.*
    INTO v_code_row
    FROM "EnrollmentCode" ec
    JOIN "Profile" p ON p.id = ec."profileId"
   WHERE ec."codeHash" = v_hash
     AND ec."consumedAt" IS NULL
     AND ec."expiresAt" > now()
     AND p.phone = p_phone
     AND p."isActive" = true
   LIMIT 1;

  IF v_code_row.id IS NULL THEN
    PERFORM public.record_phone_otp_attempt(p_phone, false);
    RAISE EXCEPTION '%', c_generic;
  END IF;

  SELECT * INTO v_profile FROM "Profile" WHERE id = v_code_row."profileId";

  UPDATE "Device"
     SET "revokedAt" = now(),
         "revokedById" = v_profile.id
   WHERE "profileId" = v_profile.id
     AND "revokedAt" IS NULL;

  v_label    := COALESCE(NULLIF(btrim(p_device->>'label'), ''), 'Unnamed device');
  v_platform := COALESCE(NULLIF(btrim(p_device->>'platform'), ''), 'unknown');
  v_os       := NULLIF(btrim(p_device->>'osVersion'), '');
  v_app      := NULLIF(btrim(p_device->>'appVersion'), '');
  v_device_id := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO "Device" (
    id, "profileId", label, platform, "osVersion", "appVersion",
    "lastSeenAt", "enrolledAt"
  ) VALUES (
    v_device_id, v_profile.id, v_label, v_platform, v_os, v_app,
    now(), now()
  );

  UPDATE "EnrollmentCode"
     SET "consumedAt" = now(),
         "consumedByDeviceId" = v_device_id
   WHERE id = v_code_row.id;

  INSERT INTO "UserAuditLog" (
    id, "actorId", "targetProfileId", action, detail, "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_profile.id, v_profile.id, 'DEVICE_ENROLLED',
    v_label || ' (' || v_platform || ')', now()
  );

  PERFORM public.record_phone_otp_attempt(p_phone, true);

  profile_id := v_profile.id;
  device_id  := v_device_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_enrollment_code(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_enrollment_code(text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_enrollment_code(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_enrollment_code(text, text, jsonb) TO service_role;
