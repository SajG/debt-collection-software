-- Enable Supabase Realtime for factory ↔ salesperson live order updates.
-- Replica identity FULL so UPDATE payloads include the row id filter columns.
ALTER TABLE "SalesOrder" REPLICA IDENTITY FULL;
ALTER TABLE "OrderStatusEvent" REPLICA IDENTITY FULL;
ALTER TABLE "OrderDocument" REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "SalesOrder";
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "OrderStatusEvent";
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "OrderDocument";
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
