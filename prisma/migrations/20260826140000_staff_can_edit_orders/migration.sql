-- staff_can_edit_orders
--
-- Any STAFF user can now see every order in the shop and correct
-- header details on any order that hasn't left the factory.
-- Rationale: mistakes get placed under pressure; whoever notices
-- should be able to fix it without waiting on the original
-- salesperson or an admin. The trade-off is that salespeople see
-- each other's pipeline, which is what the business wants.
--
-- Field gate  (trigger enforce_staff_sales_order_update):
--   STAFF may change only: partyId, newCustomerName, dispatchLocation,
--   paymentTerm, transportType, expectedDeliveryDate, tokenType, notes,
--   updatedAt. Any other change is refused with a clear error.
--
-- Status gate (RLS WITH CHECK):
--   STAFF may not UPDATE orders in DISPATCHED, PARTIALLY_DISPATCHED,
--   DELIVERED, CANCELLED, REJECTED. Once goods are out the header is
--   history.
--
-- Item edits (SalesOrderItem) are NOT enabled here — qty/rate changes
-- interact with the factory's WIP and need a separate flow.

-- ─────────────────────────────────────────────────────────────────
-- SELECT: widen so STAFF sees the whole shop.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS sales_order_select_staff ON "SalesOrder";
CREATE POLICY sales_order_select_staff ON "SalesOrder"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'STAFF');

DROP POLICY IF EXISTS order_status_event_select_staff ON "OrderStatusEvent";
CREATE POLICY order_status_event_select_staff ON "OrderStatusEvent"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderStatusEvent"."salesOrderId"
    )
  );

DROP POLICY IF EXISTS order_document_select_staff ON "OrderDocument";
CREATE POLICY order_document_select_staff ON "OrderDocument"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderDocument"."salesOrderId"
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- INSERT OrderStatusEvent as STAFF — so the edit flow can log an
-- audit line ("Details edited by …") the same way factory advance
-- and admin approve do.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS order_status_event_insert_staff ON "OrderStatusEvent";
CREATE POLICY order_status_event_insert_staff ON "OrderStatusEvent"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'STAFF'
    AND "updatedById" = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────
-- UPDATE SalesOrder header for STAFF, gated by status.
-- The trigger below is the field-level second layer.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS sales_order_update_staff ON "SalesOrder";
CREATE POLICY sales_order_update_staff ON "SalesOrder"
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'STAFF'
    AND "currentStatus" NOT IN (
      'DISPATCHED','PARTIALLY_DISPATCHED','DELIVERED','CANCELLED','REJECTED'
    )
  )
  WITH CHECK (
    public.current_user_role() = 'STAFF'
    AND "currentStatus" NOT IN (
      'DISPATCHED','PARTIALLY_DISPATCHED','DELIVERED','CANCELLED','REJECTED'
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_staff_sales_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'STAFF' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber"
      OR NEW."salespersonId" IS DISTINCT FROM OLD."salespersonId"
      OR NEW."productId" IS DISTINCT FROM OLD."productId"
      OR NEW.brand IS DISTINCT FROM OLD.brand
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW."quantityUnit" IS DISTINCT FROM OLD."quantityUnit"
      OR NEW."packingType" IS DISTINCT FROM OLD."packingType"
      OR NEW."sizeKg" IS DISTINCT FROM OLD."sizeKg"
      OR NEW."productRate" IS DISTINCT FROM OLD."productRate"
      OR NEW."orderValue" IS DISTINCT FROM OLD."orderValue"
      OR NEW."currentStatus" IS DISTINCT FROM OLD."currentStatus"
      OR NEW."expectedProductionDate" IS DISTINCT FROM OLD."expectedProductionDate"
      OR NEW."linkedInvoiceId" IS DISTINCT FROM OLD."linkedInvoiceId"
      OR NEW."creditCheckPassed" IS DISTINCT FROM OLD."creditCheckPassed"
      OR NEW."creditOverrideById" IS DISTINCT FROM OLD."creditOverrideById"
      OR NEW."creditOverrideNote" IS DISTINCT FROM OLD."creditOverrideNote"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR NEW."statusBeforeHold" IS DISTINCT FROM OLD."statusBeforeHold"
      OR NEW."holdReasonCategory" IS DISTINCT FROM OLD."holdReasonCategory"
      OR NEW."holdReason" IS DISTINCT FROM OLD."holdReason"
      OR NEW."needsRateApproval" IS DISTINCT FROM OLD."needsRateApproval"
      OR NEW."rateApprovedById" IS DISTINCT FROM OLD."rateApprovedById"
      OR NEW."rateApprovedAt" IS DISTINCT FROM OLD."rateApprovedAt"
      OR NEW."rateApprovalNote" IS DISTINCT FROM OLD."rateApprovalNote"
      OR NEW."approvedById" IS DISTINCT FROM OLD."approvedById"
      OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
      OR NEW."rejectedById" IS DISTINCT FROM OLD."rejectedById"
      OR NEW."rejectedAt" IS DISTINCT FROM OLD."rejectedAt"
      OR NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
      OR NEW."deliveredAt" IS DISTINCT FROM OLD."deliveredAt"
    THEN
      RAISE EXCEPTION
        'STAFF may only edit customer + delivery details (partyId, newCustomerName, dispatchLocation, paymentTerm, transportType, expectedDeliveryDate, tokenType, notes)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_staff_sales_order_update ON "SalesOrder";
CREATE TRIGGER trg_enforce_staff_sales_order_update
  BEFORE UPDATE ON "SalesOrder"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_staff_sales_order_update();
