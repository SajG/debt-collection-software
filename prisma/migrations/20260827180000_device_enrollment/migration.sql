-- device_enrollment (SY1)
--
-- Replaces the SMS-OTP + password-grant sign-in path with admin-issued
-- enrollment codes and a per-device registry.
--
-- Design decisions worth writing down here (not in a doc that drifts):
--
-- 1. Codes are 8 chars from an unambiguous alphabet (no 0/O/I/1/L).
--    Stored as SHA-256 hex; the plaintext leaves the DB exactly once
--    when issue_enrollment_code() returns it, and is never
--    recoverable after. This is why EnrollmentCode has no SELECT
--    policy for anyone — even an admin who could read the hash table
--    would gain nothing usable.
--
-- 2. Rate limiting on redeem re-uses the existing
--    check_phone_otp_rate_limit + record_phone_otp_attempt pair.
--    Anyone brute-forcing an 8-char code by phone gets frozen at the
--    same 5-fails-in-15-minutes threshold that gated SMS OTP.
--
-- 3. Session model, deliberate simplification: ONE active device per
--    user at a time. Redeeming a code auto-revokes any prior
--    un-revoked Device for the same profile. This lets revocation
--    remain a single `admin.signOut(user_id, "global")` call rather
--    than requiring per-JWT session tracking. A director with two
--    phones must re-enroll on the second one; that is the
--    documented trade for a clean revocation story. Upgrading to
--    per-session device binding is a future migration, not a rewrite.
--
-- 4. redeem_enrollment_code() is anon-callable. The user has no
--    session yet, so every safety check runs INSIDE the function:
--    rate limit, phone match, code hash match, expiry, consumption,
--    profile.isActive. The same generic failure message is used for
--    every failure branch so an attacker cannot distinguish
--    "wrong code" from "unknown phone" from "expired".

-- ─────────────────────────────────────────────────────────────────
-- Enum extension: audit actions for device lifecycle
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'UserAuditAction' AND e.enumlabel = 'DEVICE_ENROLLED'
  ) THEN
    ALTER TYPE "UserAuditAction" ADD VALUE 'DEVICE_ENROLLED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'UserAuditAction' AND e.enumlabel = 'DEVICE_REVOKED'
  ) THEN
    ALTER TYPE "UserAuditAction" ADD VALUE 'DEVICE_REVOKED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'UserAuditAction' AND e.enumlabel = 'ENROLLMENT_CODE_ISSUED'
  ) THEN
    ALTER TYPE "UserAuditAction" ADD VALUE 'ENROLLMENT_CODE_ISSUED';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "EnrollmentCode" (
  id                   text PRIMARY KEY,
  "profileId"          uuid NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE,
  -- SHA-256 of the plaintext code, hex-encoded. NEVER the code itself.
  "codeHash"           text NOT NULL,
  "issuedById"         uuid NOT NULL REFERENCES "Profile"(id) ON DELETE RESTRICT,
  "expiresAt"          timestamptz NOT NULL,
  "consumedAt"         timestamptz,
  "consumedByDeviceId" text,
  "createdAt"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "EnrollmentCode_profileId_expiresAt_idx"
  ON "EnrollmentCode" ("profileId", "expiresAt");

CREATE INDEX IF NOT EXISTS "EnrollmentCode_codeHash_idx"
  ON "EnrollmentCode" ("codeHash");

CREATE TABLE IF NOT EXISTS "Device" (
  id            text PRIMARY KEY,
  "profileId"   uuid NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE,
  label         text NOT NULL,
  platform      text NOT NULL,
  "osVersion"   text,
  "appVersion"  text,
  "lastSeenAt"  timestamptz NOT NULL DEFAULT now(),
  "enrolledAt"  timestamptz NOT NULL DEFAULT now(),
  "revokedAt"   timestamptz,
  "revokedById" uuid REFERENCES "Profile"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Device_profileId_revokedAt_idx"
  ON "Device" ("profileId", "revokedAt");

-- ─────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "EnrollmentCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnrollmentCode" FORCE ROW LEVEL SECURITY;
-- No SELECT / INSERT / UPDATE / DELETE policies whatsoever. Only
-- SECURITY DEFINER RPCs may touch this table. service_role bypasses
-- RLS for admin ops.

ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_select_self ON "Device";
CREATE POLICY device_select_self ON "Device"
  FOR SELECT TO authenticated
  USING ("profileId" = auth.uid());

DROP POLICY IF EXISTS device_select_admin ON "Device";
CREATE POLICY device_select_admin ON "Device"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

-- No client INSERT — only redeem_enrollment_code() writes Device rows.
-- No client DELETE — devices are revoked, never removed.
-- UPDATE limited to admin-driven revocation via revoke_device().
DROP POLICY IF EXISTS device_update_admin ON "Device";
CREATE POLICY device_update_admin ON "Device"
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- issue_enrollment_code — ADMIN generates a one-time code
-- ─────────────────────────────────────────────────────────────────

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

  -- Invalidate any unconsumed code for this profile — one live code
  -- at a time per user, so issuing a fresh code always supersedes.
  UPDATE "EnrollmentCode"
     SET "consumedAt" = now()
   WHERE "profileId" = p_profile_id
     AND "consumedAt" IS NULL;

  -- Generate 8-char code from the unambiguous alphabet.
  FOR v_i IN 1..8 LOOP
    v_idx := 1 + (floor(random() * length(v_alphabet)))::int;
    v_code := v_code || substr(v_alphabet, v_idx, 1);
  END LOOP;

  v_hash := encode(digest(v_code, 'sha256'), 'hex');
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
-- redeem_enrollment_code — anon-callable; validates + enrolls device
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
  -- One generic message for every failure branch. The audit log has
  -- the real reason; the caller does not.
  c_generic      text := 'Enrollment failed. Ask your admin for a new code.';
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RAISE EXCEPTION '%', c_generic;
  END IF;

  -- Rate-limit gate first, so brute-force attempts are throttled
  -- before any hash work. Uses the same 5-fails-in-15-minutes
  -- threshold as SMS OTP.
  SELECT limited INTO v_limited
  FROM public.check_phone_otp_rate_limit(p_phone);
  IF v_limited THEN
    RAISE EXCEPTION '%', c_generic;
  END IF;

  IF p_code IS NULL OR length(p_code) <> 8 THEN
    PERFORM public.record_phone_otp_attempt(p_phone, false);
    RAISE EXCEPTION '%', c_generic;
  END IF;

  v_hash := encode(digest(upper(btrim(p_code)), 'sha256'), 'hex');

  -- Look up the code + join to profile by phone. Both conditions in
  -- one query so we never leak which half failed. All the negative
  -- branches funnel through the same rate-limit + generic exception.
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

  -- One-active-device-per-user simplification (see header comment):
  -- revoke any prior un-revoked Device for this profile so the newly
  -- enrolled device becomes the sole active one. The server route
  -- pairs this with admin.signOut(user_id, "global") to invalidate
  -- any lingering JWTs.
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

-- ─────────────────────────────────────────────────────────────────
-- revoke_device — ADMIN marks a device revoked. The web action
-- follows with admin.signOut(profileId, "global").
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_device(
  p_device_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid;
  v_role    text;
  v_device  "Device"%ROWTYPE;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Only ADMIN may revoke devices';
  END IF;

  SELECT * INTO v_device FROM "Device" WHERE id = p_device_id;
  IF v_device.id IS NULL THEN
    RAISE EXCEPTION 'Device not found';
  END IF;
  IF v_device."revokedAt" IS NOT NULL THEN
    RETURN; -- idempotent no-op
  END IF;

  UPDATE "Device"
     SET "revokedAt" = now(),
         "revokedById" = v_actor
   WHERE id = p_device_id;

  INSERT INTO "UserAuditLog" (
    id, "actorId", "targetProfileId", action, detail, "createdAt"
  ) VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_actor, v_device."profileId", 'DEVICE_REVOKED',
    v_device.label, now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_device(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_device(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- touch_device_seen — mobile pings on cold start so the admin's
-- device list shows recency without a heavy heartbeat channel.
-- Only updates lastSeenAt for the caller's own un-revoked devices.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_device_seen(
  p_device_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RETURN; END IF;
  UPDATE "Device"
     SET "lastSeenAt" = now()
   WHERE id = p_device_id
     AND "profileId" = v_actor
     AND "revokedAt" IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_device_seen(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_device_seen(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_device_seen(text) TO service_role;
