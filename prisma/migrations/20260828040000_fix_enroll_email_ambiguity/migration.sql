-- fix_enroll_email_ambiguity
--
-- redeem_and_mint_session has an OUT parameter named `email`.
-- Postgres treats plpgsql OUT params as in-scope names, so an
-- unqualified `SELECT email FROM auth.users` inside the body is
-- ambiguous between the OUT param and the column. Fix: qualify
-- every reference to auth.users columns with the table name.
--
-- No behaviour change other than actually running.

CREATE OR REPLACE FUNCTION public.redeem_and_mint_session(
  p_phone  text,
  p_code   text,
  p_device jsonb
)
RETURNS TABLE (email text, temp_password text, device_id text, profile_id uuid)
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
  v_auth_email   text;
  v_desired_email text;
  v_device_id    text;
  v_label        text;
  v_platform     text;
  v_os           text;
  v_app          text;
  v_pw_bytes     bytea;
  v_pw_plain     text;
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

  v_desired_email := v_profile.id::text || '@device.paytrack.local';

  -- Qualify the column read: OUT parameter `email` shadows an
  -- unqualified `email` reference otherwise.
  SELECT u.email INTO v_auth_email FROM auth.users u WHERE u.id = v_profile.id;

  IF v_auth_email IS NULL OR lower(v_auth_email) <> lower(v_desired_email) THEN
    UPDATE auth.users AS u
       SET email              = v_desired_email,
           email_confirmed_at = COALESCE(u.email_confirmed_at, now())
     WHERE u.id = v_profile.id;
  END IF;

  v_pw_bytes := extensions.gen_random_bytes(32);
  v_pw_plain := encode(v_pw_bytes, 'base64');

  UPDATE auth.users AS u
     SET encrypted_password = extensions.crypt(v_pw_plain, extensions.gen_salt('bf'))
   WHERE u.id = v_profile.id;

  INSERT INTO "UserAuditLog" (
    id, "actorId", "targetProfileId", action, detail, "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_profile.id, v_profile.id, 'DEVICE_ENROLLED',
    v_label || ' (' || v_platform || ')', now()
  );

  PERFORM public.record_phone_otp_attempt(p_phone, true);

  email         := v_desired_email;
  temp_password := v_pw_plain;
  device_id     := v_device_id;
  profile_id    := v_profile.id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_and_mint_session(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_and_mint_session(text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_and_mint_session(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_and_mint_session(text, text, jsonb) TO service_role;
