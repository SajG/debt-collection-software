-- ADMIN needs to read other users' Profile rows (specifically ownerName)
-- so the mobile app's "All orders" list can show which salesperson
-- booked each order. Additive to profile_select_self — RLS combines
-- SELECT policies with OR, so STAFF still sees only their own row.
--
-- Not needed by the web app: web reads Profile via Prisma using the
-- service_role connection, which bypasses RLS entirely. This policy
-- exists to make the direct-from-mobile "All orders" view work.
--
-- Apply after 20260807000000_add_rls_policies.sql:
--   psql "$DIRECT_URL" -f supabase/migrations/20260808000000_admin_read_profiles.sql

drop policy if exists "profile_select_admin_all" on "Profile";
create policy "profile_select_admin_all" on "Profile"
  for select to authenticated
  using (public.current_user_role() = 'ADMIN');
