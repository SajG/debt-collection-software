-- mobile_settings_read (go-live fix, 2026-10-15)
--
-- Problem: SY22 enabled RLS on "BusinessSettings" and "SyncLog" with
-- only the RESTRICTIVE company policy. A restrictive policy narrows a
-- permissive one; with no permissive SELECT policy at all, Postgres
-- returns ZERO rows. The mobile app reads both tables directly:
--   * BusinessSettings.brandList / packingList  → order item sheet
--   * BusinessSettings.requireAppLock           → app-lock rule
--   * BusinessSettings.mobileMinAppVersion      → forced-update screen
--   * SyncLog.completedAt                       → "Tally updated 5 min ago"
-- so each silently fell back to its default.
--
-- Fix: members of the active company may READ their own company's row
-- (the existing RESTRICTIVE sy22_tenant_isolation policy still ANDs
-- "organizationId" = current_org_id()). BusinessSettings holds
-- encrypted provider secrets, so phones get column-level SELECT on the
-- harmless columns only. Server code uses Prisma (table owner) and is
-- unaffected. Writes stay denied to authenticated (no permissive write
-- policy is added).

-- ── BusinessSettings ───────────────────────────────────────────────
DROP POLICY IF EXISTS business_settings_select_member ON "BusinessSettings";
CREATE POLICY business_settings_select_member ON "BusinessSettings"
  FOR SELECT TO authenticated
  USING (
    "organizationId" = public.current_org_id()
    AND public.current_user_role() IS NOT NULL
  );

REVOKE SELECT ON "BusinessSettings" FROM anon, authenticated;
GRANT SELECT (
  "id",
  "organizationId",
  "brandList",
  "packingList",
  "requireAppLock",
  "mobileMinAppVersion",
  "factoryCanSeeRates"
) ON "BusinessSettings" TO authenticated;

-- ── SyncLog ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sync_log_select_member ON "SyncLog";
CREATE POLICY sync_log_select_member ON "SyncLog"
  FOR SELECT TO authenticated
  USING (
    "organizationId" = public.current_org_id()
    AND public.current_user_role() IS NOT NULL
  );
