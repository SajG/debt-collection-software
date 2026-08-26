-- add_profile_directory_read
--
-- Context: migration 20260821120000_profile_rls_own_row installed a
-- single SELECT policy on "Profile":
--     USING (id = auth.uid())
-- That is correct for AuthContext.loadProfile but silently breaks every
-- PostgREST embed that joins Profile — the salesperson on an order card,
-- the updater on a timeline event, the author of a comment, the
-- recorder of a payment. RLS returns NULL for the embed and the UI
-- shows "—" where a person's name should be.
--
-- Fix: expose a minimal directory (id, ownerName, role) via a
-- SECURITY DEFINER RPC. The full Profile table stays locked down —
-- notification prefs, phone number, isActive audit trail, etc. remain
-- own-row-only. Callers hydrate names client-side.
--
-- Why STAFF is excluded:
-- A salesperson has no business enumerating the roster (competitor
-- poaching, phishing prep). Their own row is already returned by
-- profile_select_own, and every order they can see is their own — so
-- "who placed this?" is trivially themselves. They pay the cost of
-- seeing "Unknown user" as the updater on their own timeline; that is
-- the deliberate trade against a directory-scraping oracle.
--
-- ADMIN and FACTORY both need the full directory:
--   - ADMIN sees every order in the org.
--   - FACTORY must see WHICH salesperson placed each order (core req).

CREATE OR REPLACE FUNCTION public.get_profile_directory()
RETURNS TABLE (id uuid, "ownerName" text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p."ownerName", p.role::text
  FROM "Profile" p
  WHERE p."isActive" = true
    AND public.current_user_role() IN ('ADMIN', 'FACTORY');
$$;

REVOKE ALL ON FUNCTION public.get_profile_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_directory() TO service_role;
