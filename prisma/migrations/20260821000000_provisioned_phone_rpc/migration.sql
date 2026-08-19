-- is_provisioned_phone: mobile phone screen calls this before
-- signInWithOtp so unknown numbers never cost an SMS.
--
-- SECURITY NOTE — this RPC is a phone-number oracle. To keep it from
-- being used as one, the mobile client:
--   (a) rate-limits every call through the existing
--       check_phone_otp_rate_limit(phone) machinery, and
--   (b) shows the SAME generic error message ("This number is not
--       registered. Contact your administrator.") whether the number
--       is unprovisioned OR rate-limited OR the RPC itself failed.
-- The client-side check is a cost control — the actual security
-- boundary is Supabase Auth (which should be configured to allow
-- sign-in only from the provisioned phone list; see mobile/README.md).

CREATE OR REPLACE FUNCTION public.is_provisioned_phone(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "Profile"
    WHERE "isActive" = true
      AND (
        -- Profile.phone is stored as +91XXXXXXXXXX after this migration
        -- lands and the seed runs. Legacy rows stored as 10-digit
        -- strings still match via the second predicate.
        phone = p_phone
        OR (
          p_phone ~ '^\+91\d{10}$'
          AND phone = substr(p_phone, 4)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_provisioned_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_provisioned_phone(text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_provisioned_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_provisioned_phone(text) TO service_role;
