-- email_otp_signin (SY-email replaces SY1)
--
-- Removes the custom device-enrollment SQL surface and replaces it
-- with Supabase's native email OTP:
--
--   * mobile signInWithOtp({ email, options: { shouldCreateUser: false } })
--   * verifyOtp({ email, token, type: 'email' })
--   * post-signin, mobile calls register_device(p_device jsonb) which
--     inserts the Device row + revokes any prior one. This RPC is
--     authenticated-only, so it needs no anon grant and no password
--     handling.
--
-- What is DROPPED and WHY:
--
--   redeem_and_mint_session — was anon-callable, SECURITY DEFINER,
--     wrote directly to auth.users.encrypted_password, returned a
--     plaintext password that stayed valid indefinitely. Native OTP
--     removes every one of those risks.
--
--   redeem_enrollment_code + issue_enrollment_code — the older
--     magic-link flow the SQL-mint replaced. Not called from any
--     surviving surface after this migration lands.
--
--   EnrollmentCode table — the code storage those two RPCs shared.
--     No production data worth preserving; codes were one-shot,
--     30-minute-lived, and any live rows are hash-only anyway.
--
-- What SURVIVES:
--
--   Device table + revoke_device + touch_device_seen — the device
--     inventory is the SY6 "sync visible to admin" surface and is
--     still correct. Only the enrollment-code plumbing is going.
--
--   Profile.email + INVITED / INVITE_RESENT audit — the SY-email
--     admin invite path stays; email OTP is how the recipient
--     actually signs in.

-- ─────────────────────────────────────────────────────────────────
-- 1. New rate-limit factor for email OTP
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'LoginAttemptFactor' AND e.enumlabel = 'EMAIL_OTP'
  ) THEN
    ALTER TYPE "LoginAttemptFactor" ADD VALUE 'EMAIL_OTP';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. register_device — post-signin device inventory hook
--
-- Called by the mobile app after verifyOtp succeeds. Runs as the
-- authenticated caller (auth.uid()), so a token from anon or from
-- another user can't register a device on someone else's account.
--
-- One-active-device invariant preserved: any prior un-revoked
-- Device row for this profile is revoked in the same statement.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_device(
  p_device jsonb
)
RETURNS TABLE (device_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      uuid;
  v_role       text;
  v_label      text;
  v_platform   text;
  v_os         text;
  v_app        text;
  v_device_id  text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_role := public.current_user_role();
  IF v_role IS NULL THEN
    -- Deactivated / no-profile users get NULL from current_user_role;
    -- refuse to write a device row for a session that shouldn't exist.
    RAISE EXCEPTION 'Account disabled';
  END IF;

  v_label    := COALESCE(NULLIF(btrim(p_device->>'label'), ''), 'Unnamed device');
  v_platform := COALESCE(NULLIF(btrim(p_device->>'platform'), ''), 'unknown');
  v_os       := NULLIF(btrim(p_device->>'osVersion'), '');
  v_app      := NULLIF(btrim(p_device->>'appVersion'), '');
  v_device_id := replace(gen_random_uuid()::text, '-', '');

  -- Revoke any prior un-revoked Device for this profile. Matches the
  -- same invariant the old redeem_enrollment_code enforced.
  UPDATE "Device"
     SET "revokedAt"   = now(),
         "revokedById" = v_actor
   WHERE "profileId" = v_actor
     AND "revokedAt" IS NULL;

  INSERT INTO "Device" (
    id, "profileId", label, platform, "osVersion", "appVersion",
    "lastSeenAt", "enrolledAt"
  ) VALUES (
    v_device_id, v_actor, v_label, v_platform, v_os, v_app,
    now(), now()
  );

  INSERT INTO "UserAuditLog" (
    id, "actorId", "targetProfileId", action, detail, "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_actor, v_actor, 'DEVICE_ENROLLED',
    v_label || ' (' || v_platform || ')', now()
  );

  device_id := v_device_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_device(jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 3. Drop the enrollment-code surface
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.redeem_and_mint_session(text, text, jsonb);
DROP FUNCTION IF EXISTS public.redeem_enrollment_code(text, text, jsonb);
DROP FUNCTION IF EXISTS public.issue_enrollment_code(uuid);

-- CASCADE off — refuse if a FK from somewhere still references
-- EnrollmentCode. Nothing should; belt-and-braces.
DROP TABLE IF EXISTS "EnrollmentCode";

-- ─────────────────────────────────────────────────────────────────
-- 4. Comment refresh on register_device so \df+ carries the rule.
-- ─────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.register_device(jsonb) IS
  'Post-signin device inventory hook. Authenticated-only. Revokes any prior un-revoked Device for the caller and inserts a new one. Do NOT expose to anon — pre-signin device state is meaningless.';
