-- Notification dispatchers. Every trigger converges on one helper —
-- public._dispatch_notification(event jsonb) — which reads the shared
-- NotificationConfig row and POSTs to the Expo-backed edge function
-- via pg_net. The edge function is the only place that talks to
-- Expo's push service (see supabase/functions/notify/index.ts).
--
-- Both pg_net and pg_cron must be enabled first (Supabase dashboard →
-- Database → Extensions). This migration creates them idempotently so
-- a fresh clone also works if the DB role has permission.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─────────────────────────────────────────────────────────────────
-- Central dispatcher. Fire-and-forget HTTP POST to the edge function.
-- Never raises — a bad HTTP response mustn't block the underlying
-- INSERT/UPDATE, which is business-critical.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._dispatch_notification(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg  "NotificationConfig"%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM "NotificationConfig" WHERE id = 'singleton';
  IF v_cfg."edgeFunctionUrl" IS NULL OR v_cfg."edgeFunctionUrl" = '' THEN
    -- Not deployed yet — silently skip so a fresh DB doesn't error on
    -- every INSERT. Ops step: set the URL + secret post-deploy.
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_cfg."edgeFunctionUrl",
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', COALESCE(v_cfg."edgeFunctionSecret", '')
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Never block the caller. Log a warning; the edge function can be
  -- retried by re-firing the trigger manually if needed.
  RAISE WARNING '_dispatch_notification failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public._dispatch_notification(jsonb) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────
-- Trigger 1: OrderStatusEvent → notify the salesperson on that order.
-- Only fires for the "real" status transitions (not the initial
-- ORDER_PLACED event that the create RPC writes, which the
-- salesperson already saw locally). Comparing against currentStatus
-- would race the update; use notes convention instead: the create
-- RPC always writes notes = 'Order placed' for the seed event, so we
-- skip that specific case.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._notify_on_order_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order "SalesOrder"%ROWTYPE;
BEGIN
  IF NEW.notes = 'Order placed' AND NEW.status = 'ORDER_PLACED' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = NEW."salesOrderId";
  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public._dispatch_notification(jsonb_build_object(
    'event',        'status_change',
    'salesOrderId', v_order.id,
    'orderNumber',  v_order."orderNumber",
    'status',       NEW.status,
    'salespersonId', v_order."salespersonId"
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_status_event ON "OrderStatusEvent";
CREATE TRIGGER trg_notify_order_status_event
  AFTER INSERT ON "OrderStatusEvent"
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_on_order_status_event();

-- ─────────────────────────────────────────────────────────────────
-- Trigger 2: OrderDocument (INVOICE / LORRY_RECEIPT) → notify the
-- order's salesperson. ORDER_PROOF / OTHER are self-uploaded, no
-- point pinging them.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._notify_on_order_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order "SalesOrder"%ROWTYPE;
BEGIN
  IF NEW.type NOT IN ('INVOICE', 'LORRY_RECEIPT') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM "SalesOrder" WHERE id = NEW."salesOrderId";
  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  PERFORM public._dispatch_notification(jsonb_build_object(
    'event',         'document_upload',
    'salesOrderId',  v_order.id,
    'orderNumber',   v_order."orderNumber",
    'documentType',  NEW.type,
    'salespersonId', v_order."salespersonId"
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_document ON "OrderDocument";
CREATE TRIGGER trg_notify_order_document
  AFTER INSERT ON "OrderDocument"
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_on_order_document();

-- ─────────────────────────────────────────────────────────────────
-- Trigger 3: SalesOrder with creditCheckPassed = false → notify all
-- ADMINs. Fires on INSERT only (the credit override flow updates the
-- row later; that's an admin action and shouldn't self-ping).
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._notify_on_credit_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."creditCheckPassed" = true THEN RETURN NEW; END IF;

  PERFORM public._dispatch_notification(jsonb_build_object(
    'event',        'credit_issue',
    'salesOrderId', NEW.id,
    'orderNumber',  NEW."orderNumber"
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_credit_issue ON "SalesOrder";
CREATE TRIGGER trg_notify_credit_issue
  AFTER INSERT ON "SalesOrder"
  FOR EACH ROW
  EXECUTE FUNCTION public._notify_on_credit_issue();

-- ─────────────────────────────────────────────────────────────────
-- Stale-order sweep. Runs hourly. Picks orders that have been in
-- ORDER_PLACED for longer than NotificationConfig.staleOrderHours
-- and haven't already been flagged in the last window (to avoid
-- pinging the same order every hour). Dedupe is done by looking at
-- the OrderStatusEvent history — if no non-seed event exists AND
-- createdAt is old enough, it's stale.
--
-- Uses an SLA table to remember which orders we've already flagged
-- so admins don't get pinged forever on the same order.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "StaleOrderNotice" (
  "salesOrderId" TEXT PRIMARY KEY REFERENCES "SalesOrder"("id") ON DELETE CASCADE,
  "notifiedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public._sweep_stale_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours int;
  r       record;
BEGIN
  SELECT "staleOrderHours" INTO v_hours
  FROM "NotificationConfig" WHERE id = 'singleton';
  IF v_hours IS NULL OR v_hours <= 0 THEN RETURN; END IF;

  FOR r IN
    SELECT so.id, so."orderNumber", so."createdAt", so."salespersonId"
    FROM "SalesOrder" so
    LEFT JOIN "StaleOrderNotice" n ON n."salesOrderId" = so.id
    WHERE so."currentStatus" = 'ORDER_PLACED'
      AND so."createdAt" < now() - make_interval(hours := v_hours)
      AND n."salesOrderId" IS NULL
  LOOP
    PERFORM public._dispatch_notification(jsonb_build_object(
      'event',        'stale_order',
      'salesOrderId', r.id,
      'orderNumber',  r."orderNumber",
      'hoursOld',     EXTRACT(EPOCH FROM (now() - r."createdAt"))::int / 3600
    ));
    INSERT INTO "StaleOrderNotice" ("salesOrderId") VALUES (r.id)
    ON CONFLICT ("salesOrderId") DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._sweep_stale_orders() FROM PUBLIC;

-- Register the hourly job. cron.schedule is idempotent-ish: repeated
-- calls with the same name replace the existing entry.
SELECT cron.schedule(
  'notify-stale-orders-hourly',
  '0 * * * *',
  $$SELECT public._sweep_stale_orders();$$
);

-- Clean the stale-notice table when an order finally leaves
-- ORDER_PLACED so a re-created order (or a re-opened one) can be
-- flagged again if it stalls a second time.
CREATE OR REPLACE FUNCTION public._reset_stale_notice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."currentStatus" IS DISTINCT FROM 'ORDER_PLACED'
     AND OLD."currentStatus" = 'ORDER_PLACED' THEN
    DELETE FROM "StaleOrderNotice" WHERE "salesOrderId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_stale_notice ON "SalesOrder";
CREATE TRIGGER trg_reset_stale_notice
  AFTER UPDATE ON "SalesOrder"
  FOR EACH ROW
  EXECUTE FUNCTION public._reset_stale_notice();
