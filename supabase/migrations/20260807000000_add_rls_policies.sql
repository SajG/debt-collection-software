-- Row-Level Security for direct Supabase client access from the upcoming
-- React Native mobile app. Prisma doesn't manage RLS, so this lives outside
-- prisma/schema.prisma and is applied separately.
--
-- Apply in this order:
--   1. Add FACTORY to the "Role" enum in prisma/schema.prisma (done)
--   2. npm run db:push        -- Prisma applies the enum change
--   3. npm run db:rls          -- applies this file via psql
--
-- The service_role Postgres role (used by Tally sync + all Prisma / node code
-- that runs with SUPABASE_SERVICE_ROLE_KEY) has the BYPASSRLS attribute and
-- therefore skips every policy in this file. Do not weaken that; it's the
-- explicit escape hatch for trusted server code.
--
-- authenticated == any signed-in Supabase user.
-- anon          == unauthenticated. Given no policy grants anon anything below,
--                  anon is fully locked out of these tables.

-- ─────────────────────────────────────────────────────────────────
-- Enum: ensure FACTORY exists even if db push hasn't run yet.
-- ─────────────────────────────────────────────────────────────────

alter type "Role" add value if not exists 'FACTORY';

-- ─────────────────────────────────────────────────────────────────
-- Baseline privileges. RLS enforces the actual scope; without these
-- grants, PostgREST would 403 before RLS is even evaluated.
-- ─────────────────────────────────────────────────────────────────

grant select, insert, update, delete on
  "Party", "Invoice", "Payment",
  "SalesOrder", "OrderStatusEvent",
  "Product", "Profile"
  to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- Helper: current_user_role() reads the caller's role from Profile.
-- SECURITY DEFINER so it works even under Profile's own restrictive
-- SELECT policy. STABLE so Postgres can cache within a statement.
-- ─────────────────────────────────────────────────────────────────

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text
  from "Profile" p
  where p.id = auth.uid()
$$;

grant execute on function public.current_user_role() to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- Enable RLS. FORCE also closes the table-owner loophole; BYPASSRLS
-- roles (service_role) still bypass, which is exactly what we want.
-- ─────────────────────────────────────────────────────────────────

alter table "Party"            enable row level security;
alter table "Invoice"          enable row level security;
alter table "Payment"          enable row level security;
alter table "SalesOrder"       enable row level security;
alter table "OrderStatusEvent" enable row level security;
alter table "Product"          enable row level security;
alter table "Profile"          enable row level security;

alter table "Party"            force row level security;
alter table "Invoice"          force row level security;
alter table "Payment"          force row level security;
alter table "SalesOrder"       force row level security;
alter table "OrderStatusEvent" force row level security;
alter table "Product"          force row level security;
alter table "Profile"          force row level security;

-- ─────────────────────────────────────────────────────────────────
-- Profile: users see and update only their own row.
-- ADMIN account management goes through the service_role admin UI.
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "profile_select_self" on "Profile";
create policy "profile_select_self" on "Profile"
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profile_update_self" on "Profile";
create policy "profile_update_self" on "Profile"
  for update to authenticated
  using      (id = auth.uid())
  with check (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- Product: catalogue is read-only for STAFF/FACTORY; ADMIN mutates.
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "product_select_authed" on "Product";
create policy "product_select_authed" on "Product"
  for select to authenticated
  using (true);

drop policy if exists "product_admin_insert" on "Product";
create policy "product_admin_insert" on "Product"
  for insert to authenticated
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "product_admin_update" on "Product";
create policy "product_admin_update" on "Product"
  for update to authenticated
  using      (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "product_admin_delete" on "Product";
create policy "product_admin_delete" on "Product"
  for delete to authenticated
  using (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- Party: mirrors lib/authz.ts partyScopeWhere().
-- ADMIN: all rows, all ops.
-- STAFF: SELECT rows assigned to them or unassigned. No write.
-- FACTORY: no access to parties (they operate on orders only).
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "party_admin_all" on "Party";
create policy "party_admin_all" on "Party"
  for all to authenticated
  using      (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "party_staff_scoped_select" on "Party";
create policy "party_staff_scoped_select" on "Party"
  for select to authenticated
  using (
    public.current_user_role() = 'STAFF'
    and ("assignedToId" = auth.uid() or "assignedToId" is null)
  );

-- ─────────────────────────────────────────────────────────────────
-- Invoice + Payment: visible when the caller can see the parent Party.
-- The EXISTS subquery runs under the caller's RLS on "Party", so the
-- party-scope rule is inherited automatically.
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "invoice_admin_all" on "Invoice";
create policy "invoice_admin_all" on "Invoice"
  for all to authenticated
  using      (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "invoice_party_scoped_select" on "Invoice";
create policy "invoice_party_scoped_select" on "Invoice"
  for select to authenticated
  using (exists (
    select 1 from "Party" p where p.id = "Invoice"."partyId"
  ));

drop policy if exists "payment_admin_all" on "Payment";
create policy "payment_admin_all" on "Payment"
  for all to authenticated
  using      (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "payment_party_scoped_select" on "Payment";
create policy "payment_party_scoped_select" on "Payment"
  for select to authenticated
  using (exists (
    select 1 from "Party" p where p.id = "Payment"."partyId"
  ));

-- ─────────────────────────────────────────────────────────────────
-- SalesOrder:
--   ADMIN   → everything.
--   STAFF   → SELECT + INSERT own orders (salespersonId = auth.uid()).
--   FACTORY → SELECT all; no INSERT / UPDATE / DELETE.
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "sales_order_admin_all" on "SalesOrder";
create policy "sales_order_admin_all" on "SalesOrder"
  for all to authenticated
  using      (public.current_user_role() = 'ADMIN')
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "sales_order_staff_select_own" on "SalesOrder";
create policy "sales_order_staff_select_own" on "SalesOrder"
  for select to authenticated
  using (
    public.current_user_role() = 'STAFF'
    and "salespersonId" = auth.uid()
  );

drop policy if exists "sales_order_staff_insert_own" on "SalesOrder";
create policy "sales_order_staff_insert_own" on "SalesOrder"
  for insert to authenticated
  with check (
    public.current_user_role() = 'STAFF'
    and "salespersonId" = auth.uid()
  );

drop policy if exists "sales_order_factory_select_all" on "SalesOrder";
create policy "sales_order_factory_select_all" on "SalesOrder"
  for select to authenticated
  using (public.current_user_role() = 'FACTORY');

-- ─────────────────────────────────────────────────────────────────
-- OrderStatusEvent (append-only audit log):
--   ADMIN + FACTORY → SELECT + INSERT.
--   STAFF           → SELECT only events on their own orders.
--   Nobody          → UPDATE or DELETE (no policy = deny; belt-and-
--                     -braces the "never update or delete" contract).
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "order_status_event_admin_select" on "OrderStatusEvent";
create policy "order_status_event_admin_select" on "OrderStatusEvent"
  for select to authenticated
  using (public.current_user_role() = 'ADMIN');

drop policy if exists "order_status_event_admin_insert" on "OrderStatusEvent";
create policy "order_status_event_admin_insert" on "OrderStatusEvent"
  for insert to authenticated
  with check (public.current_user_role() = 'ADMIN');

drop policy if exists "order_status_event_factory_select" on "OrderStatusEvent";
create policy "order_status_event_factory_select" on "OrderStatusEvent"
  for select to authenticated
  using (public.current_user_role() = 'FACTORY');

drop policy if exists "order_status_event_factory_insert" on "OrderStatusEvent";
create policy "order_status_event_factory_insert" on "OrderStatusEvent"
  for insert to authenticated
  with check (public.current_user_role() = 'FACTORY');

drop policy if exists "order_status_event_staff_select_own" on "OrderStatusEvent";
create policy "order_status_event_staff_select_own" on "OrderStatusEvent"
  for select to authenticated
  using (
    public.current_user_role() = 'STAFF'
    and exists (
      select 1 from "SalesOrder" so
      where so.id = "OrderStatusEvent"."salesOrderId"
        and so."salespersonId" = auth.uid()
    )
  );
