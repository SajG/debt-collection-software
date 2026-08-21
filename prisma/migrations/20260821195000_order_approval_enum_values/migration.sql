-- P1 (part 1 of 2) — add the new OrderStatus enum values in their
-- own migration so the RPC changes in the follow-up migration can
-- use them. Postgres refuses to use a newly-added enum value inside
-- the same transaction that added it (SQLSTATE 55P04:
-- "unsafe use of new value").
--
-- Also creates the OrderApprovalMode enum here — same reason: the
-- BusinessSettings column added in part 2 references it.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderApprovalMode') THEN
    CREATE TYPE "OrderApprovalMode" AS ENUM ('NONE', 'EXCEPTIONS_ONLY', 'ALL');
  END IF;
END $$;
