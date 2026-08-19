-- Enable receipt (payment) sync from Tally alongside parties + invoices.
--
-- Payment.tallyRef gets a partial unique index so re-running a sync
-- upserts rather than duplicating. Composite key for receipts:
--   receipt:<voucher-guid>:<invoice-number>   → per-allocation Payment row
--   receipt:<voucher-guid>:onaccount          → residual unallocated amount
--
-- Party gains tallyOutstanding / tallyBalanceAsOf so the reconciliation
-- report can compare Tally's own ledger closing balance against the
-- app-computed balance. Any mismatch is a sync bug.

-- ─────────────────────────────────────────────────────────────────
-- SyncType extension. Explicit ADD VALUE so the change is idempotent
-- across re-runs of prisma migrate deploy.
-- ─────────────────────────────────────────────────────────────────

ALTER TYPE "SyncType" ADD VALUE IF NOT EXISTS 'IMPORT_RECEIPTS';

-- ─────────────────────────────────────────────────────────────────
-- Payment dedupe key. Partial index only over non-null tallyRef so
-- manually recorded payments (tallyRef = NULL) can coexist without
-- collisions.
-- ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_tallyRef_key"
  ON "Payment" ("tallyRef")
  WHERE "tallyRef" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- Tally-side snapshot on Party. Populated by ingestPartyRows when
-- the ledger export includes CLOSINGBALANCE.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Party"
  ADD COLUMN IF NOT EXISTS "tallyOutstanding" DECIMAL(14, 2),
  ADD COLUMN IF NOT EXISTS "tallyBalanceAsOf" TIMESTAMPTZ;
