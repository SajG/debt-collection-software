-- normalize_enroll_phone
--
-- `Profile.phone` is stored as the 10-digit local number (per
-- prisma/team.ts and every historical UI). The mobile enroll screen
-- sends E.164 (`+917774055316`) through /api/auth/enroll, which
-- forwards it verbatim to redeem_enrollment_code. The prior version
-- of the RPC compared `p.phone = p_phone` directly and never
-- matched, so every enrollment attempt failed with the generic
-- error — including the first one for the account that ran the
-- rotation.
--
-- Fix: strip a leading `+`, then a leading `91`, before comparing.
-- Rate-limit calls keep the original string so per-phone freezes
-- still work off the E.164 the client sent.

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
  v_phone_local  text;
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

  -- Normalise incoming phone against Profile.phone (10-digit local).
  -- Strip any leading '+', then a leading '91'. Anything else is left
  -- alone so a stored E.164 (future migration) still matches itself.
  v_phone_local := regexp_replace(btrim(p_phone), '^\+', '');
  IF length(v_phone_local) = 12 AND substring(v_phone_local, 1, 2) = '91' THEN
    v_phone_local := substring(v_phone_local, 3);
  END IF;

  SELECT ec.*
    INTO v_code_row
    FROM "EnrollmentCode" ec
    JOIN "Profile" p ON p.id = ec."profileId"
   WHERE ec."codeHash" = v_hash
     AND ec."consumedAt" IS NULL
     AND ec."expiresAt" > now()
     AND p.phone = v_phone_local
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
