-- profile_directory_phone
--
-- Add `phone` to get_profile_directory() so the factory can tap-to-call
-- the salesperson from an order card. Same restriction as before —
-- ADMIN + FACTORY only; STAFF sees an empty set.
--
-- Postgres refuses CREATE OR REPLACE when the RETURNS TABLE column
-- list changes ("cannot change return type of existing function").
-- Drop the prior signature first, then recreate. Safe: get_profile_directory
-- has no dependents beyond the client callers, which resolve the new
-- shape on next call.

DROP FUNCTION IF EXISTS public.get_profile_directory();

CREATE OR REPLACE FUNCTION public.get_profile_directory()
RETURNS TABLE (id uuid, "ownerName" text, role text, phone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p."ownerName", p.role::text, p.phone
  FROM "Profile" p
  WHERE p."isActive" = true
    AND public.current_user_role() IN ('ADMIN', 'FACTORY');
$$;

REVOKE ALL ON FUNCTION public.get_profile_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_directory() TO service_role;
