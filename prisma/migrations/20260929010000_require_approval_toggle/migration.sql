-- Audit item 10 — surface the "every order needs approval" policy as
-- a plain boolean on /settings. The three-value orderApprovalMode
-- enum stays for reporting; the boolean is the one an admin flips.
--
-- Default true so every existing distributor stays on the current
-- ALL policy. The RPC create_sales_order_v2 (migration
-- 20260826120000_require_admin_approval_all_orders) already gates
-- routing by role; the toggle here is UI-only for now — a future
-- migration wires it into the RPC once we let a distributor opt out.

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "requireApprovalForAllOrders"
    BOOLEAN NOT NULL DEFAULT true;

UPDATE "BusinessSettings"
   SET "requireApprovalForAllOrders" = true
 WHERE "requireApprovalForAllOrders" IS DISTINCT FROM true;
