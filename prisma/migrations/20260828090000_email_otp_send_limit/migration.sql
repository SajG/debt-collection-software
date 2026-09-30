-- email_otp_send_limit (SY15.7)
--
-- Supabase built-in signInWithOtp has a global rate limit but not a
-- per-email one, so a single address can be spammed until the global
-- bucket is drained (which then blocks OTP for everyone). Add an
-- app-side per-email counter: 3 sends per email per 15 minutes.
-- Mobile calls check_email_otp_send_limit BEFORE signInWithOtp; if
-- the RPC returns ok=false, we skip the send and still advance to
-- the code screen (SY15.8) so send-blocked ≠ account-exists.
--
-- Table: EmailOtpSendLog. One row per send attempt. Grows small; a
-- cron/manual sweep can prune older than a day.
--
-- Function: check_email_otp_send_limit(p_email text) RETURNS
--   TABLE(ok boolean). SECURITY DEFINER + anon-callable — the
--   pre-signin path has no session. Case-normalizes email. Inserts
--   the log row when ok=true (single round-trip, no TOCTOU).

CREATE TABLE IF NOT EXISTS "EmailOtpSendLog" (
  id     text        PRIMARY KEY,
  email  text        NOT NULL,
  "sentAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "EmailOtpSendLog_email_sentAt_idx"
  ON "EmailOtpSendLog" (email, "sentAt" DESC);

CREATE OR REPLACE FUNCTION public.check_email_otp_send_limit(
  p_email text
)
RETURNS TABLE (ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_recent int;
BEGIN
  v_email := lower(btrim(COALESCE(p_email, '')));
  IF v_email = '' THEN
    ok := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*) INTO v_recent
    FROM "EmailOtpSendLog"
   WHERE email = v_email
     AND "sentAt" > now() - interval '15 minutes';

  IF v_recent >= 3 THEN
    ok := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO "EmailOtpSendLog" (id, email)
  VALUES (replace(gen_random_uuid()::text, '-', ''), v_email);

  ok := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_email_otp_send_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_otp_send_limit(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_otp_send_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_otp_send_limit(text) TO service_role;

-- RLS: table is only touched via the SECURITY DEFINER RPC. Lock it
-- down so nobody can read the send log through PostgREST.
ALTER TABLE "EmailOtpSendLog" ENABLE ROW LEVEL SECURITY;

COMMENT ON FUNCTION public.check_email_otp_send_limit(text) IS
  'Per-email OTP send limiter (3/15min). Anon-callable. Inserts the log row when ok=true. Callers must still call signInWithOtp separately; this only decides whether to.';
