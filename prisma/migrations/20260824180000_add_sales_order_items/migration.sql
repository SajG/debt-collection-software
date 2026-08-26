-- add_sales_order_items
--
-- Introduces SalesOrderItem so one SalesOrder can hold N SKUs (the
-- factory and the customer both regard multi-SKU orders as ONE order;
-- the salesperson used to run the wizard N times).
--
-- Design:
--   - Line data lives on SalesOrderItem.
--   - The scalar columns on SalesOrder (productId, quantity, etc.)
--     are DEPRECATED but kept in place — the Tally connector, the web
--     console, and the current mobile build all still read them. A
--     trigger mirrors line 1 to those scalars, and rolls SUM(lineValue)
--     into SalesOrder.orderValue. Drop is deferred (see
--     docs/MULTI-SKU-MIGRATION.md).
--   - Rate approval is per-line. SalesOrder."needsRateApproval" is
--     derived as OR-of-lines so the factory RLS in
--     20260821160000_factory_rls_needs_rate_approval (which reads
--     SalesOrder."needsRateApproval") keeps working with zero policy
--     changes.

CREATE TABLE "SalesOrderItem" (
  "id"                text        PRIMARY KEY,
  "salesOrderId"      text        NOT NULL,
  "productId"         text        NOT NULL,
  "brand"             text        NOT NULL,
  "quantity"          numeric(10,3) NOT NULL,
  "quantityUnit"      text        NOT NULL,
  "packingType"       text,
  "sizeKg"            text,
  "productRate"       text        NOT NULL,
  "lineValue"         numeric(12,2) NOT NULL,
  "lineNumber"        integer     NOT NULL,
  "needsRateApproval" boolean     NOT NULL DEFAULT false,
  "rateApprovedById"  uuid,
  "rateApprovedAt"    timestamptz,
  "rateApprovalNote"  text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "SalesOrderItem_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE,
  CONSTRAINT "SalesOrderItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id"),
  CONSTRAINT "SalesOrderItem_rateApprovedById_fkey"
    FOREIGN KEY ("rateApprovedById") REFERENCES "Profile"("id")
);

CREATE UNIQUE INDEX "SalesOrderItem_salesOrderId_lineNumber_key"
  ON "SalesOrderItem"("salesOrderId", "lineNumber");
CREATE INDEX "SalesOrderItem_salesOrderId_idx"
  ON "SalesOrderItem"("salesOrderId");

-- ── Backfill: one line per existing order ────────────────────────────
DO $$
DECLARE
  v_order_count integer;
  v_item_count  integer;
BEGIN
  SELECT count(*) INTO v_order_count FROM "SalesOrder";

  INSERT INTO "SalesOrderItem" (
    "id", "salesOrderId", "productId", "brand",
    "quantity", "quantityUnit", "packingType", "sizeKg",
    "productRate", "lineValue", "lineNumber",
    "needsRateApproval", "rateApprovedById", "rateApprovedAt",
    "rateApprovalNote", "createdAt", "updatedAt"
  )
  SELECT
    replace(gen_random_uuid()::text, '-', ''),
    "id", "productId", "brand",
    "quantity", "quantityUnit", "packingType", "sizeKg",
    "productRate", "orderValue", 1,
    "needsRateApproval", "rateApprovedById", "rateApprovedAt",
    "rateApprovalNote", "createdAt", "updatedAt"
  FROM "SalesOrder";

  SELECT count(*) INTO v_item_count FROM "SalesOrderItem";
  IF v_item_count <> v_order_count THEN
    RAISE EXCEPTION
      'Backfill mismatch: % orders but % items created', v_order_count, v_item_count;
  END IF;
  RAISE NOTICE 'Backfill OK: % orders → % line items', v_order_count, v_item_count;
END $$;

-- ── Rollup trigger ──────────────────────────────────────────────────
-- After any INSERT/UPDATE/DELETE on SalesOrderItem, recompute the
-- deprecated scalars on the parent order:
--   - line 1 mirrors productId / brand / quantity / quantityUnit /
--     packingType / sizeKg / productRate
--   - orderValue = SUM(lineValue)
--   - needsRateApproval = bool_or(line.needsRateApproval)
--   - rateApproved* mirrored from line 1 if the whole order is clear.
--
-- SECURITY DEFINER so the trigger can UPDATE SalesOrder without being
-- blocked by the factory RLS (which forbids UPDATE when
-- needsRateApproval=true). search_path pinned to public.
CREATE OR REPLACE FUNCTION public._rollup_sales_order_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id text;
  v_line1    "SalesOrderItem"%ROWTYPE;
  v_sum      numeric(12,2);
  v_any_ap   boolean;
BEGIN
  v_order_id := COALESCE(NEW."salesOrderId", OLD."salesOrderId");

  SELECT * INTO v_line1
    FROM "SalesOrderItem"
   WHERE "salesOrderId" = v_order_id
   ORDER BY "lineNumber" ASC
   LIMIT 1;

  -- If the last line is being deleted (via cascade or manual delete),
  -- leave the parent row alone — the cascade will remove it too.
  IF v_line1."id" IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM("lineValue"), 0),
         bool_or("needsRateApproval")
    INTO v_sum, v_any_ap
    FROM "SalesOrderItem"
   WHERE "salesOrderId" = v_order_id;

  UPDATE "SalesOrder"
     SET "productId"         = v_line1."productId",
         "brand"             = v_line1."brand",
         "quantity"          = v_line1."quantity",
         "quantityUnit"      = v_line1."quantityUnit",
         "packingType"       = v_line1."packingType",
         "sizeKg"            = v_line1."sizeKg",
         "productRate"       = v_line1."productRate",
         "orderValue"        = v_sum,
         "needsRateApproval" = v_any_ap,
         -- Only mirror rateApproved* onto the header when the whole
         -- order is clear — otherwise the F6 audit trail on the
         -- header would misrepresent the still-pending lines.
         "rateApprovedById"  = CASE WHEN v_any_ap THEN NULL ELSE v_line1."rateApprovedById" END,
         "rateApprovedAt"    = CASE WHEN v_any_ap THEN NULL ELSE v_line1."rateApprovedAt"   END,
         "rateApprovalNote"  = CASE WHEN v_any_ap THEN NULL ELSE v_line1."rateApprovalNote" END,
         "updatedAt"         = now()
   WHERE "id" = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public._rollup_sales_order_from_items() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rollup_sales_order_items_iud ON "SalesOrderItem";
CREATE TRIGGER trg_rollup_sales_order_items_iud
  AFTER INSERT OR UPDATE OR DELETE ON "SalesOrderItem"
  FOR EACH ROW EXECUTE FUNCTION public._rollup_sales_order_from_items();

-- ── RLS on the new table ────────────────────────────────────────────
-- Mirror the SalesOrder policies: a caller sees an item iff they can
-- see the parent order. This avoids duplicating the STAFF/ADMIN/FACTORY
-- role branching — parent visibility is already correctly gated.
ALTER TABLE "SalesOrderItem" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_order_item_select_parent ON "SalesOrderItem";
CREATE POLICY sales_order_item_select_parent
  ON "SalesOrderItem"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so."id" = "SalesOrderItem"."salesOrderId"
    )
  );

-- Writes only via the RPC (SECURITY DEFINER runs as owner and bypasses
-- these). No direct INSERT/UPDATE/DELETE grants to authenticated.
