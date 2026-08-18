-- Extend LoginAttempt to record phone-OTP attempts alongside the
-- existing email/password attempts, then expose two SECURITY DEFINER
-- RPCs the mobile app can call before/after phone OTP verify:
--   check_phone_otp_rate_limit(phone)  → { limited, retryAfterMinutes }
--   record_phone_otp_attempt(phone, successful) → void
--
-- Rate window matches web login: 5 failed attempts / 15 min blocks
-- further verifies. Send-code throttling is handled by Supabase Auth
-- itself; this table catches the "guess the OTP" attack.

ALTER TABLE "LoginAttempt"
  ADD COLUMN "phone" TEXT,
  ALTER COLUMN "email" DROP NOT NULL;

CREATE INDEX "LoginAttempt_phone_createdAt_idx"
  ON "LoginAttempt" ("phone", "createdAt");

-- Belt + braces: at least one identifier must be present.
ALTER TABLE "LoginAttempt"
  ADD CONSTRAINT "LoginAttempt_identifier_present"
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- Rate limit check — safe to call from anon clients (no PII returned).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_phone_otp_rate_limit(
  p_phone text
)
RETURNS TABLE (limited boolean, retry_after_minutes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_failed int;
BEGIN
  v_phone := btrim(p_phone);
  IF v_phone = '' OR v_phone IS NULL THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_failed
  FROM "LoginAttempt"
  WHERE "phone" = v_phone
    AND "successful" = false
    AND "createdAt" > now() - interval '15 minutes';

  RETURN QUERY SELECT v_failed >= 5, 15;
END;
$$;

REVOKE ALL ON FUNCTION public.check_phone_otp_rate_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_phone_otp_rate_limit(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_phone_otp_rate_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_phone_otp_rate_limit(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- Record attempt — anon-callable so the mobile client can log a
-- failed verify without needing a session first. Successful verifies
-- are also logged (useful for audit + spotting compromised accounts).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_phone_otp_attempt(
  p_phone      text,
  p_successful boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  v_phone := btrim(p_phone);
  IF v_phone = '' OR v_phone IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "LoginAttempt" (id, "phone", "successful", "createdAt")
  VALUES (
    replace(gen_random_uuid()::text, '-', ''),
    v_phone,
    p_successful,
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_phone_otp_attempt(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_phone_otp_attempt(text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.record_phone_otp_attempt(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_phone_otp_attempt(text, boolean) TO service_role;
