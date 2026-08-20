-- P0-C — Enforce the F6 rate-approval gate at the database.
--
-- Before: the gate lived in one Prisma where clause on
-- app/(dashboard)/production/page.tsx. RLS policy
-- sales_order_select_factory was USING (current_user_role() =
-- 'FACTORY') with no needsRateApproval predicate; mobile
-- (staff)/index.tsx via useOwnOrders never mentioned the flag either.
-- Result: a FACTORY session on mobile could see and advance below-
-- floor orders that the web deliberately hides.
--
-- This migration:
--   1. Tightens sales_order_select_factory to also require
--      needsRateApproval = false. Both clients now inherit the gate
--      from RLS.
--   2. Tightens sales_order_update_factory the same way — a FACTORY
--      JWT cannot UPDATE a needsRateApproval=true order at all.
--   3. Adds a BEFORE UPDATE belt-and-braces check inside
--      enforce_factory_sales_order_update so even a future policy
--      loosening cannot let FACTORY change currentStatus on a
--      still-unapproved order.
--
-- Not touched: sales_order_admin_all (ADMIN sees + writes everything,
-- including approval-pending orders — that's the whole point of the
-- rate-approvals queue).

DROP POLICY IF EXISTS sales_order_select_factory ON "SalesOrder";
DROP POLICY IF EXISTS sales_order_update_factory ON "SalesOrder";

CREATE POLICY sales_order_select_factory ON "SalesOrder"
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'FACTORY'
    AND "needsRateApproval" = false
  );

CREATE POLICY sales_order_update_factory ON "SalesOrder"
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'FACTORY'
    AND "needsRateApproval" = false
  )
  WITH CHECK (
    public.current_user_role() = 'FACTORY'
    AND "needsRateApproval" = false
  );

-- ─────────────────────────────────────────────────────────────────
-- Belt + braces: refuse currentStatus changes on approval-pending
-- orders even if a future policy edit accidentally re-opens
-- visibility for FACTORY. The existing trigger already whitelists
-- the two fields FACTORY may touch (currentStatus, expected-
-- ProductionDate); adding a needsRateApproval short-circuit at the
-- top keeps it a one-file lookup for anyone auditing FACTORY writes.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_factory_sales_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'FACTORY' THEN
    IF OLD."needsRateApproval" = true THEN
      RAISE EXCEPTION
        'FACTORY may not act on orders awaiting rate approval'
        USING ERRCODE = 'check_violation';
    END IF;
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
      OR NEW."dispatchLocation" IS DISTINCT FROM OLD."dispatchLocation"
      OR NEW."tokenType" IS DISTINCT FROM OLD."tokenType"
      OR NEW.notes IS DISTINCT FROM OLD.notes
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
    THEN
      RAISE EXCEPTION 'FACTORY may only update currentStatus and expectedProductionDate';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
