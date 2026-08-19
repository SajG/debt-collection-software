-- OrderStatus += DELIVERED. Closes the loop after DISPATCHED so we
-- have a real order-to-delivery time series. Confirmable by the
-- salesperson or by the customer via a signed link (customer-facing
-- link ships in Batch 2 with F4).
--
-- Enum ADD VALUE lives in its own idempotent statement so a re-run
-- doesn't error.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

-- Also stamp the delivery moment on SalesOrder so we don't have to
-- scan the event log to compute the metric.
ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMPTZ;
