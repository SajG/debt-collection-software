-- Database-side mirror of lib/ar/balance.ts::recomputePartyOutstanding.
-- Keeps Party.totalOutstanding correct no matter who writes:
--   web server actions (already recompute in TS),
--   mobile app (direct INSERTs — the reason this trigger exists),
--   ad-hoc SQL / imports.
--
-- Formula:
--   Σ(totalAmount − paidAmount − creditedAmount) over non-cancelled invoices
--   − Σ(amount) over on-account payments (invoiceId IS NULL)
--
-- SECURITY DEFINER so it can write Party even when the caller lacks
-- UPDATE privileges on Party (STAFF via RLS today).

CREATE OR REPLACE FUNCTION public.paytrack_recompute_party_outstanding(p_party_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_total numeric(14, 2);
  v_on_account numeric(14, 2);
  v_outstanding numeric(14, 2);
BEGIN
  SELECT COALESCE(
    SUM("totalAmount" - "paidAmount" - "creditedAmount"),
    0
  )
    INTO v_invoice_total
    FROM "Invoice"
   WHERE "partyId" = p_party_id
     AND "status" <> 'CANCELLED';

  SELECT COALESCE(SUM("amount"), 0)
    INTO v_on_account
    FROM "Payment"
   WHERE "partyId" = p_party_id
     AND "invoiceId" IS NULL;

  v_outstanding := v_invoice_total - v_on_account;

  UPDATE "Party"
     SET "totalOutstanding" = v_outstanding
   WHERE "id" = p_party_id;
END;
$$;

-- ── Payment trigger ────────────────────────────────────────────────
-- Handles INSERT/UPDATE/DELETE. On UPDATE we recompute for BOTH the old
-- and new partyId in case a payment was reassigned (unusual but cheap).

CREATE OR REPLACE FUNCTION public.paytrack_payment_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.paytrack_recompute_party_outstanding(OLD."partyId");
    RETURN OLD;
  END IF;

  PERFORM public.paytrack_recompute_party_outstanding(NEW."partyId");
  IF (TG_OP = 'UPDATE' AND NEW."partyId" IS DISTINCT FROM OLD."partyId") THEN
    PERFORM public.paytrack_recompute_party_outstanding(OLD."partyId");
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_recompute_outstanding ON "Payment";
CREATE TRIGGER payment_recompute_outstanding
AFTER INSERT OR UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION public.paytrack_payment_after_change();

-- ── Invoice trigger ────────────────────────────────────────────────
-- Recomputes when totals, paid, credited, status, or party change.
-- WHEN clause skips no-op UPDATE hits (touch-only "updatedAt" writes).

CREATE OR REPLACE FUNCTION public.paytrack_invoice_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.paytrack_recompute_party_outstanding(OLD."partyId");
    RETURN OLD;
  END IF;

  PERFORM public.paytrack_recompute_party_outstanding(NEW."partyId");
  IF (TG_OP = 'UPDATE' AND NEW."partyId" IS DISTINCT FROM OLD."partyId") THEN
    PERFORM public.paytrack_recompute_party_outstanding(OLD."partyId");
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_recompute_outstanding ON "Invoice";
CREATE TRIGGER invoice_recompute_outstanding
AFTER INSERT OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION public.paytrack_invoice_after_change();

DROP TRIGGER IF EXISTS invoice_recompute_outstanding_upd ON "Invoice";
CREATE TRIGGER invoice_recompute_outstanding_upd
AFTER UPDATE OF "totalAmount", "paidAmount", "creditedAmount", "status", "partyId"
ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION public.paytrack_invoice_after_change();

-- ── CreditNote trigger ────────────────────────────────────────────
-- Credit notes touch Invoice.creditedAmount directly (in the web action),
-- but recomputing on their own mutation is cheap and forgiving.

CREATE OR REPLACE FUNCTION public.paytrack_credit_note_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.paytrack_recompute_party_outstanding(OLD."partyId");
    RETURN OLD;
  END IF;

  PERFORM public.paytrack_recompute_party_outstanding(NEW."partyId");
  IF (TG_OP = 'UPDATE' AND NEW."partyId" IS DISTINCT FROM OLD."partyId") THEN
    PERFORM public.paytrack_recompute_party_outstanding(OLD."partyId");
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_note_recompute_outstanding ON "CreditNote";
CREATE TRIGGER credit_note_recompute_outstanding
AFTER INSERT OR UPDATE OR DELETE ON "CreditNote"
FOR EACH ROW EXECUTE FUNCTION public.paytrack_credit_note_after_change();

-- ── One-off backfill so every existing party is correct before the
-- triggers take over as the source of truth.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM "Party" LOOP
    PERFORM public.paytrack_recompute_party_outstanding(r.id);
  END LOOP;
END $$;
