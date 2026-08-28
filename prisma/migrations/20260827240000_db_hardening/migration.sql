-- db_hardening (SY7)
--
-- Three changes, all belt-and-braces on top of an already-strict
-- RLS model:
--
-- 1. Statement timeout for the two roles clients ever use. Prisma
--    (server-side) and the Supabase service_role bypass this floor
--    intentionally — long-running admin jobs and schema migrations
--    need it. Anon + authenticated cap at 10 s so a pathological
--    query cannot pin a connection.
--
-- 2. FORCE ROW LEVEL SECURITY on every table already carrying an
--    ENABLE. FORCE matters because the table owner (postgres) is
--    otherwise exempt from policies — a leaked owner password
--    would bypass every scope check. FORCE closes that path
--    without loosening any existing policy.
--
-- 3. Explicit READMES for the four subsystems whose SECURITY
--    DEFINER surface would be catastrophic to break — a comment
--    on the function that future refactors WILL see when they run
--    \df+ or read pg_proc. No behaviour change.

-- ─────────────────────────────────────────────────────────────────
-- 1. Per-role statement timeout
-- ─────────────────────────────────────────────────────────────────

ALTER ROLE authenticated SET statement_timeout = '10s';
ALTER ROLE anon         SET statement_timeout = '10s';
-- service_role deliberately untouched — used by CSV imports, Tally
-- reconciliation, and one-shot admin scripts that legitimately run
-- longer. If a service_role query is slow that's a query bug, not
-- a limit to raise.

-- ─────────────────────────────────────────────────────────────────
-- 2. FORCE RLS on every domain table
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Action"             FORCE ROW LEVEL SECURITY;
ALTER TABLE "Device"             FORCE ROW LEVEL SECURITY;
ALTER TABLE "DispatchLot"        FORCE ROW LEVEL SECURITY;
ALTER TABLE "EnrollmentCode"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "Invoice"            FORCE ROW LEVEL SECURITY;
ALTER TABLE "Message"            FORCE ROW LEVEL SECURITY;
ALTER TABLE "NotificationConfig" FORCE ROW LEVEL SECURITY;
ALTER TABLE "OrderComment"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "OrderDocument"      FORCE ROW LEVEL SECURITY;
ALTER TABLE "OrderStatusEvent"   FORCE ROW LEVEL SECURITY;
ALTER TABLE "Party"              FORCE ROW LEVEL SECURITY;
ALTER TABLE "Payment"            FORCE ROW LEVEL SECURITY;
ALTER TABLE "PaymentDocument"    FORCE ROW LEVEL SECURITY;
ALTER TABLE "Product"            FORCE ROW LEVEL SECURITY;
ALTER TABLE "PushToken"          FORCE ROW LEVEL SECURITY;
ALTER TABLE "RecoveryCode"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "SalesOrder"         FORCE ROW LEVEL SECURITY;
ALTER TABLE "SalesOrderItem"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "StockItem"          FORCE ROW LEVEL SECURITY;
ALTER TABLE "UserAuditLog"       FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- 3. Comments on the load-bearing SECURITY DEFINER functions.
-- No behaviour change; future refactors read this.
-- ─────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.current_user_role() IS
  'Auth-gate for every domain RLS policy. Returns NULL for deactivated profiles so a flipped isActive locks the user out at the DB layer, not just the UI. Do NOT widen to include inactive users.';

COMMENT ON FUNCTION public.redeem_enrollment_code(text, text, jsonb) IS
  'Anon-callable device-enrollment endpoint. Every safety check runs INSIDE the function because the caller has no session yet: rate limit, hash compare, expiry, consumption, phone match, profile.isActive. Same generic failure for every branch — do not add branch-specific error messages.';

COMMENT ON FUNCTION public.consume_recovery_code(uuid, text) IS
  'Service-role only. Do not GRANT to authenticated or anon — the client must never bypass the login-challenge flow to burn a recovery code directly.';
