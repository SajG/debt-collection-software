-- enforce_device_revocation (SY15.1)
--
-- BUG BEFORE THIS MIGRATION: register_device flipped the previous
-- Device.revokedAt to now(), but nothing invalidated that device's
-- session. The old phone kept full RLS access indefinitely. The
-- admin/devices page showed the device as revoked — a lie the
-- console told about its own security posture.
--
-- Fix: put the device_id on the JWT and gate every RLS policy on
-- "this device row is still un-revoked."
--
-- Layout:
--
--   1. register_device stamps auth.users.raw_app_meta_data.device_id
--      with the just-inserted device id. app_metadata (not
--      user_metadata) — user_metadata is client-writable and would
--      let a device forge its own id and defeat the check.
--
--   2. New helper current_device_ok() reads that claim from the
--      caller's JWT and confirms the referenced Device row exists,
--      belongs to auth.uid(), and is not revoked. Web sessions
--      carry no device_id claim — they return true so web keeps
--      working (web sessions are governed by MFA + middleware, not
--      the mobile device registry).
--
--   3. current_user_role() is rewritten to fold in
--      current_device_ok() — returning NULL when the device is
--      revoked. Every existing RLS policy already gates on
--      current_user_role, so every policy inherits the check
--      without a rewrite.
--
--   4. touch_device_seen() now returns a table with an `ok`
--      boolean — the old function silently no-op'd on a revoked
--      device. The mobile client polls this on cold start; when
--      ok is false it signs the user out and clears the local
--      device id. That's how an old phone learns it was replaced.
--      JWT is cached up to an hour, so revocation still takes up
--      to a token-refresh cycle to bite via RLS; the touch-check
--      is the fast path that closes the gap for the app itself.
--
-- Backwards compat: `touch_device_seen(p_device_id text) → void`
-- callers get replaced with the new returning form. Grep confirmed
-- only mobile/src/auth/AuthContext.tsx calls it, and that call is
-- updated in the same change set as this migration.

-- ─────────────────────────────────────────────────────────────────
-- 1. current_device_ok — reads the JWT app_metadata claim
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_device_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- No claim → web session (or a session pre-dating this
    -- migration). Not device-gated.
    WHEN auth.jwt() -> 'app_metadata' ->> 'device_id' IS NULL
      THEN true
    ELSE EXISTS (
      SELECT 1
        FROM "Device"
       WHERE id           = auth.jwt() -> 'app_metadata' ->> 'device_id'
         AND "profileId"  = auth.uid()
         AND "revokedAt"  IS NULL
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.current_device_ok() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_device_ok() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_device_ok() TO service_role;

COMMENT ON FUNCTION public.current_device_ok() IS
  'True when the caller''s JWT device_id claim points at a live, un-revoked Device row owned by auth.uid(). NULL claim (web) returns true. Called from current_user_role — every RLS policy inherits.';

-- ─────────────────────────────────────────────────────────────────
-- 2. current_user_role — fold the device check in
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.current_device_ok() THEN NULL
    WHEN p."isActive"                    THEN p."role"::text
    ELSE NULL
  END
  FROM "Profile" p
  WHERE p.id = auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3. register_device — stamp device_id into app_metadata
--    (rewritten in-place; body is unchanged apart from the
--    auth.users update at the end)
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
    RAISE EXCEPTION 'Account disabled';
  END IF;

  v_label    := COALESCE(NULLIF(btrim(p_device->>'label'), ''), 'Unnamed device');
  v_platform := COALESCE(NULLIF(btrim(p_device->>'platform'), ''), 'unknown');
  v_os       := NULLIF(btrim(p_device->>'osVersion'), '');
  v_app      := NULLIF(btrim(p_device->>'appVersion'), '');
  v_device_id := replace(gen_random_uuid()::text, '-', '');

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

  -- Stamp device_id on the JWT so current_device_ok() can find it
  -- on the next token refresh. app_metadata NOT user_metadata —
  -- user_metadata is client-writable.
  UPDATE auth.users
     SET raw_app_meta_data =
           COALESCE(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('device_id', v_device_id)
   WHERE id = v_actor;

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
-- 4. touch_device_seen — now returns ok so the app can act on
--    revocation before the JWT refresh cycle catches up
-- ─────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.touch_device_seen(text);

CREATE OR REPLACE FUNCTION public.touch_device_seen(
  p_device_id text
)
RETURNS TABLE (ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_ok    boolean := false;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    ok := false;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE "Device"
     SET "lastSeenAt" = now()
   WHERE id = p_device_id
     AND "profileId" = v_actor
     AND "revokedAt" IS NULL
  RETURNING true INTO v_ok;

  ok := COALESCE(v_ok, false);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_device_seen(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_device_seen(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_device_seen(text) TO service_role;

COMMENT ON FUNCTION public.touch_device_seen(text) IS
  'Returns ok=false when the device row is missing or revoked. Mobile AuthContext signs the user out on ok=false so an old phone learns it was replaced without waiting for the JWT to refresh.';
