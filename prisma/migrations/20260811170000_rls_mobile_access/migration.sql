-- Row Level Security for mobile / direct Supabase access.
-- Prisma cannot express RLS; this SQL is the source of truth for policies.
-- The Postgres role used by Prisma and the Supabase service_role JWT both
-- bypass RLS (BYPASSRLS / service_role), so Tally sync and server jobs keep working.

-- ─────────────────────────────────────────────────────────────────
-- Helper: role of the authenticated user (from Profile)
-- SECURITY DEFINER so it can read Profile even if Profile has no
-- SELECT policy for authenticated clients.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "role"::text
  FROM "Profile"
  WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- FACTORY may only change SalesOrder.currentStatus (and updatedAt)
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_factory_sales_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'FACTORY' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber"
      OR NEW."partyId" IS DISTINCT FROM OLD."partyId"
      OR NEW."newCustomerName" IS DISTINCT FROM OLD."newCustomerName"
      OR NEW."salespersonId" IS DISTINCT FROM OLD."salespersonId"
      OR NEW."productId" IS DISTINCT FROM OLD."productId"
      OR NEW.brand IS DISTINCT FROM OLD.brand
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW."quantityUnit" IS DISTINCT FROM OLD."quantityUnit"
      OR NEW."packingType" IS DISTINCT FROM OLD."packingType"
      OR NEW."sizeKg" IS DISTINCT FROM OLD."sizeKg"
      OR NEW."productRate" IS DISTINCT FROM OLD."productRate"
      OR NEW."orderValue" IS DISTINCT FROM OLD."orderValue"
      OR NEW."paymentTerm" IS DISTINCT FROM OLD."paymentTerm"
      OR NEW."transportType" IS DISTINCT FROM OLD."transportType"
      OR NEW."expectedDeliveryDate" IS DISTINCT FROM OLD."expectedDeliveryDate"
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW."linkedInvoiceId" IS DISTINCT FROM OLD."linkedInvoiceId"
      OR NEW."creditCheckPassed" IS DISTINCT FROM OLD."creditCheckPassed"
      OR NEW."creditOverrideById" IS DISTINCT FROM OLD."creditOverrideById"
      OR NEW."creditOverrideNote" IS DISTINCT FROM OLD."creditOverrideNote"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'FACTORY may only update SalesOrder.currentStatus';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_factory_sales_order_update ON "SalesOrder";
CREATE TRIGGER trg_enforce_factory_sales_order_update
  BEFORE UPDATE ON "SalesOrder"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_factory_sales_order_update();

-- Ensure RLS is on (already true on this project; idempotent)
ALTER TABLE "Party" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Action" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderStatusEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- Party
-- STAFF: own assigned rows only
-- ADMIN / FACTORY: all
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS party_select_staff ON "Party";
DROP POLICY IF EXISTS party_select_admin ON "Party";
DROP POLICY IF EXISTS party_select_factory ON "Party";

CREATE POLICY party_select_staff ON "Party"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND "assignedToId" = auth.uid()
  );

CREATE POLICY party_select_admin ON "Party"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

CREATE POLICY party_select_factory ON "Party"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'FACTORY');

-- ─────────────────────────────────────────────────────────────────
-- Invoice / Payment / Message / Action
-- STAFF: rows whose party is assigned to them
-- ADMIN: all
-- FACTORY: no access (no policies)
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS invoice_select_staff ON "Invoice";
DROP POLICY IF EXISTS invoice_select_admin ON "Invoice";

CREATE POLICY invoice_select_staff ON "Invoice"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "Invoice"."partyId"
        AND p."assignedToId" = auth.uid()
    )
  );

CREATE POLICY invoice_select_admin ON "Invoice"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS payment_select_staff ON "Payment";
DROP POLICY IF EXISTS payment_select_admin ON "Payment";

CREATE POLICY payment_select_staff ON "Payment"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "Payment"."partyId"
        AND p."assignedToId" = auth.uid()
    )
  );

CREATE POLICY payment_select_admin ON "Payment"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS message_select_staff ON "Message";
DROP POLICY IF EXISTS message_select_admin ON "Message";

CREATE POLICY message_select_staff ON "Message"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "Message"."partyId"
        AND p."assignedToId" = auth.uid()
    )
  );

CREATE POLICY message_select_admin ON "Message"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS action_select_staff ON "Action";
DROP POLICY IF EXISTS action_select_admin ON "Action";

CREATE POLICY action_select_staff ON "Action"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "Action"."partyId"
        AND p."assignedToId" = auth.uid()
    )
  );

CREATE POLICY action_select_admin ON "Action"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- SalesOrder
-- STAFF: SELECT + INSERT own (salespersonId = auth.uid())
-- FACTORY: SELECT all + UPDATE (currentStatus only; enforced by trigger)
-- ADMIN: full access
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS sales_order_select_staff ON "SalesOrder";
DROP POLICY IF EXISTS sales_order_insert_staff ON "SalesOrder";
DROP POLICY IF EXISTS sales_order_select_factory ON "SalesOrder";
DROP POLICY IF EXISTS sales_order_update_factory ON "SalesOrder";
DROP POLICY IF EXISTS sales_order_admin_all ON "SalesOrder";

CREATE POLICY sales_order_select_staff ON "SalesOrder"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND "salespersonId" = auth.uid()
  );

CREATE POLICY sales_order_insert_staff ON "SalesOrder"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'STAFF'
    AND "salespersonId" = auth.uid()
  );

CREATE POLICY sales_order_select_factory ON "SalesOrder"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'FACTORY');

CREATE POLICY sales_order_update_factory ON "SalesOrder"
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'FACTORY')
  WITH CHECK (public.current_user_role() = 'FACTORY');

CREATE POLICY sales_order_admin_all ON "SalesOrder"
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- OrderStatusEvent — append-only audit log
-- FACTORY / ADMIN: INSERT (+ SELECT so they can read the trail)
-- STAFF: SELECT events for their own orders only
-- No UPDATE / DELETE policies for anyone (service_role bypasses)
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS order_status_event_select_staff ON "OrderStatusEvent";
DROP POLICY IF EXISTS order_status_event_select_factory ON "OrderStatusEvent";
DROP POLICY IF EXISTS order_status_event_select_admin ON "OrderStatusEvent";
DROP POLICY IF EXISTS order_status_event_insert_factory ON "OrderStatusEvent";
DROP POLICY IF EXISTS order_status_event_insert_admin ON "OrderStatusEvent";

CREATE POLICY order_status_event_select_staff ON "OrderStatusEvent"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderStatusEvent"."salesOrderId"
        AND so."salespersonId" = auth.uid()
    )
  );

CREATE POLICY order_status_event_select_factory ON "OrderStatusEvent"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'FACTORY');

CREATE POLICY order_status_event_select_admin ON "OrderStatusEvent"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

CREATE POLICY order_status_event_insert_factory ON "OrderStatusEvent"
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'FACTORY');

CREATE POLICY order_status_event_insert_admin ON "OrderStatusEvent"
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- OrderDocument
-- FACTORY / ADMIN: INSERT (+ SELECT)
-- STAFF: SELECT documents on their own orders only
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS order_document_select_staff ON "OrderDocument";
DROP POLICY IF EXISTS order_document_select_factory ON "OrderDocument";
DROP POLICY IF EXISTS order_document_select_admin ON "OrderDocument";
DROP POLICY IF EXISTS order_document_insert_factory ON "OrderDocument";
DROP POLICY IF EXISTS order_document_insert_admin ON "OrderDocument";

CREATE POLICY order_document_select_staff ON "OrderDocument"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderDocument"."salesOrderId"
        AND so."salespersonId" = auth.uid()
    )
  );

CREATE POLICY order_document_select_factory ON "OrderDocument"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'FACTORY');

CREATE POLICY order_document_select_admin ON "OrderDocument"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

CREATE POLICY order_document_insert_factory ON "OrderDocument"
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'FACTORY');

CREATE POLICY order_document_insert_admin ON "OrderDocument"
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'ADMIN');

-- ─────────────────────────────────────────────────────────────────
-- StockItem: authenticated SELECT only; writes via service_role
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS stock_item_select_authenticated ON "StockItem";

CREATE POLICY stock_item_select_authenticated ON "StockItem"
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'STAFF', 'FACTORY'));

-- ─────────────────────────────────────────────────────────────────
-- Product: authenticated SELECT; ADMIN write
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS product_select_authenticated ON "Product";
DROP POLICY IF EXISTS product_insert_admin ON "Product";
DROP POLICY IF EXISTS product_update_admin ON "Product";
DROP POLICY IF EXISTS product_delete_admin ON "Product";

CREATE POLICY product_select_authenticated ON "Product"
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('ADMIN', 'STAFF', 'FACTORY'));

CREATE POLICY product_insert_admin ON "Product"
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'ADMIN');

CREATE POLICY product_update_admin ON "Product"
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

CREATE POLICY product_delete_admin ON "Product"
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'ADMIN');
