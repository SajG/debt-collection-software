-- Audit item 10 — admin push when a STAFF order lingers in
-- PENDING_APPROVAL. Cron /api/cron/notify-pending-approval reads
-- SalesOrder WHERE currentStatus='PENDING_APPROVAL' AND
-- "adminPendingNotifiedAt" IS NULL AND "createdAt" < now()-30min,
-- fires the push, and stamps this column. The (currentStatus,
-- adminPendingNotifiedAt) index keeps that lookup index-only.

ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "adminPendingNotifiedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "SalesOrder_currentStatus_adminPendingNotifiedAt_idx"
  ON "SalesOrder" ("currentStatus", "adminPendingNotifiedAt")
  WHERE "currentStatus" = 'PENDING_APPROVAL';
