-- enroll_mint_session
--
-- SY1-b: fold "redeem + mint session" into a single RPC so mobile
-- can enrol without ever calling a Next.js route. The old shape
-- (mobile POST /api/auth/enroll → server generates magiclink →
-- client verifyOtp) needed an EXPO_PUBLIC_API_BASE_URL to be
-- configured, which was a persistent config-drift bug.
--
-- New shape:
--
--   1. Mobile calls public.redeem_and_mint_session(phone, code,
--      device) via the anon-key supabase client.
--   2. This RPC runs everything redeem_enrollment_code did (rate
--      limit, hash compare, phone match, isActive, Device insert)
--      AND ALSO:
--        - attaches a synthetic email (<uuid>@device.paytrack.local)
--          to the auth.users row if one isn't already there
--        - generates a fresh 32-byte password
--        - writes bcrypt(password) into auth.users.encrypted_password
--        - returns { email, temp_password, device_id }
--   3. Mobile immediately calls
--      supabase.auth.signInWithPassword({ email, password: temp })
--      which is a plain anon-key POST — no admin, no Vercel URL.
--   4. Same "one active device per user" invariant: any prior
--      un-revoked Device row is revoked in step 2, and the same
--      encrypted_password overwrite means every prior device's
--      cached password (if any) is worthless.
--
-- Password over the wire is TLS-only. The credential is single-use
-- in practice — the client uses it once, immediately, and it stays
-- on the auth user until the next enrollment. That is not a
-- regression from the magiclink flow, which also returned a
-- one-shot credential.

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

  -- Revoke any prior un-revoked Device — one active device per user.
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

  -- Ensure the auth user has an email. Reuse existing if it looks
  -- like our synthetic pattern; otherwise stamp a new one keyed on
  -- profile id (stable across enrolments so a re-enrol on a new
  -- device doesn't scatter emails).
  v_desired_email := v_profile.id::text || '@device.paytrack.local';
  SELECT email INTO v_auth_email FROM auth.users WHERE id = v_profile.id;

  IF v_auth_email IS NULL OR lower(v_auth_email) <> lower(v_desired_email) THEN
    UPDATE auth.users
       SET email             = v_desired_email,
           email_confirmed_at = COALESCE(email_confirmed_at, now())
     WHERE id = v_profile.id;
  END IF;

  -- Generate a 32-byte password and bcrypt-hash it. auth.crypt +
  -- gen_salt are provided by pgcrypto (installed under extensions).
  v_pw_bytes := extensions.gen_random_bytes(32);
  v_pw_plain := encode(v_pw_bytes, 'base64');

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(v_pw_plain, extensions.gen_salt('bf'))
   WHERE id = v_profile.id;

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
