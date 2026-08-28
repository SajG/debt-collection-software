-- mfa_recovery_codes (SY2)
--
-- Two changes, both in support of mandatory TOTP MFA for the ADMIN role:
--
-- 1. LoginAttempt gains a `factor` column so a failed password can be
--    told apart from a failed TOTP challenge in the rate-limit query.
--    Existing rows backfill as 'PASSWORD' — the only kind of attempt
--    the table has ever recorded until now.
--
-- 2. New RecoveryCode table. Supabase Auth's native MFA does not ship
--    recovery / backup codes, so we roll our own: at TOTP enrolment
--    the server generates 8 single-use codes, shows them to the user
--    exactly once, and stores only their SHA-256 hashes. A code
--    consumed via the challenge screen sets `usedAt` and cannot be
--    replayed.
--
-- No RLS policies on RecoveryCode — access is only through the
-- SECURITY DEFINER RPCs below, so an admin who could read the hash
-- table gains nothing usable.

-- ─────────────────────────────────────────────────────────────────
-- LoginAttempt.factor
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'LoginAttemptFactor'
  ) THEN
    CREATE TYPE "LoginAttemptFactor" AS ENUM ('PASSWORD', 'TOTP', 'RECOVERY');
  END IF;
END $$;

ALTER TABLE "LoginAttempt"
  ADD COLUMN IF NOT EXISTS "factor" "LoginAttemptFactor" NOT NULL DEFAULT 'PASSWORD';

CREATE INDEX IF NOT EXISTS "LoginAttempt_email_factor_createdAt_idx"
  ON "LoginAttempt" ("email", "factor", "createdAt");

-- ─────────────────────────────────────────────────────────────────
-- RecoveryCode
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "RecoveryCode" (
  id          text        PRIMARY KEY,
  "profileId" uuid        NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE,
  "codeHash"  text        NOT NULL,
  "usedAt"    timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "RecoveryCode_profileId_usedAt_idx"
  ON "RecoveryCode" ("profileId", "usedAt");

ALTER TABLE "RecoveryCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecoveryCode" FORCE ROW LEVEL SECURITY;
-- No client policies. service_role bypasses; SECURITY DEFINER RPCs
-- below are the only sanctioned access path.

-- ─────────────────────────────────────────────────────────────────
-- rotate_recovery_codes — called after successful TOTP enrol.
-- Wipes the caller's old codes and inserts 8 new hashes. Returns
-- nothing; the plaintext codes are generated client-side (in the
-- server route, not the browser) and passed in already hashed.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rotate_recovery_codes(
  p_hashes text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_hash  text;
  v_i     int;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_hashes IS NULL OR array_length(p_hashes, 1) IS NULL THEN
    RAISE EXCEPTION 'No hashes provided';
  END IF;
  IF array_length(p_hashes, 1) > 32 THEN
    RAISE EXCEPTION 'Refusing to insert more than 32 codes in one batch';
  END IF;

  DELETE FROM "RecoveryCode" WHERE "profileId" = v_actor;

  FOR v_i IN 1..array_length(p_hashes, 1) LOOP
    v_hash := p_hashes[v_i];
    IF v_hash IS NULL OR length(v_hash) < 32 THEN
      RAISE EXCEPTION 'Recovery-code hash % is malformed', v_i;
    END IF;
    INSERT INTO "RecoveryCode" (id, "profileId", "codeHash", "createdAt")
    VALUES (
      replace(gen_random_uuid()::text, '-', ''),
      v_actor, v_hash, now()
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_recovery_codes(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_recovery_codes(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_recovery_codes(text[]) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- consume_recovery_code — anon-callable BUT the caller passes an
-- already-authenticated user id (this is only invoked from the
-- server route after Supabase has issued an aal1 session and the
-- server has decided the user typed a recovery code). Returns true
-- if a matching un-used code exists and was consumed atomically.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consume_recovery_code(
  p_profile_id uuid,
  p_hash       text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_id text;
BEGIN
  IF p_profile_id IS NULL OR p_hash IS NULL OR length(p_hash) < 32 THEN
    RETURN false;
  END IF;

  UPDATE "RecoveryCode"
     SET "usedAt" = now()
   WHERE "profileId" = p_profile_id
     AND "codeHash"  = p_hash
     AND "usedAt"    IS NULL
  RETURNING id INTO v_row_id;

  RETURN v_row_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_recovery_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_recovery_code(uuid, text) TO service_role;
-- Deliberately NOT granted to anon / authenticated. Only the server
-- route (service_role) may consume; the client never touches this.

-- ─────────────────────────────────────────────────────────────────
-- count_active_recovery_codes — for the security settings page
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_active_recovery_codes()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM "RecoveryCode"
  WHERE "profileId" = auth.uid() AND "usedAt" IS NULL
$$;

REVOKE ALL ON FUNCTION public.count_active_recovery_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_active_recovery_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_recovery_codes() TO service_role;
