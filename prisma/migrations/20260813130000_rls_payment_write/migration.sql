-- RLS + Storage policies to let the mobile app record payments and
-- attach proof photos directly through Supabase (no Next.js server hop).
--
-- Design:
--   Payment          — STAFF may INSERT on parties assigned to them,
--                      ADMIN may INSERT any. FACTORY no access (already).
--   PaymentDocument  — SELECT scoped to what the user can see on Payment;
--                      INSERT allowed for STAFF/ADMIN with uploadedById =
--                      auth.uid() and paymentId visible.
--   storage.objects  — `payment-proofs` bucket: authenticated users may
--                      insert AND select (client shows previews). Deletes
--                      restricted to service_role (audit-friendly).

-- ─────────────────────────────────────────────────────────────────
-- Payment INSERT
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS payment_insert_staff ON "Payment";
DROP POLICY IF EXISTS payment_insert_admin ON "Payment";

CREATE POLICY payment_insert_staff ON "Payment"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'STAFF'
    AND "recordedById" = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "Party" p
      WHERE p.id = "Payment"."partyId"
        AND (p."assignedToId" = auth.uid() OR p."assignedToId" IS NULL)
    )
  );

CREATE POLICY payment_insert_admin ON "Payment"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'ADMIN'
    AND "recordedById" = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────
-- PaymentDocument RLS
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "PaymentDocument" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_document_select ON "PaymentDocument";
DROP POLICY IF EXISTS payment_document_insert ON "PaymentDocument";

-- SELECT: mirror Payment visibility. Anyone who can SELECT the parent
-- Payment can SELECT its documents (RLS on Payment is checked via the
-- EXISTS subquery so we don't have to duplicate the party-scope logic).
CREATE POLICY payment_document_select ON "PaymentDocument"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Payment" pay
      WHERE pay.id = "PaymentDocument"."paymentId"
    )
  );

-- INSERT: uploader must be the current user and must be able to SELECT
-- the parent Payment. ADMIN + STAFF only — factory doesn't attach
-- payment proofs.
CREATE POLICY payment_document_insert ON "PaymentDocument"
  FOR INSERT TO authenticated
  WITH CHECK (
    "uploadedById" = auth.uid()
    AND public.current_user_role() IN ('STAFF', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM "Payment" pay
      WHERE pay.id = "PaymentDocument"."paymentId"
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- Storage — payment-proofs bucket policies
-- The bucket is created lazily by the web server on first upload;
-- these policies are safe to define even if the bucket row doesn't
-- exist yet.
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS payment_proofs_insert ON storage.objects;
DROP POLICY IF EXISTS payment_proofs_select ON storage.objects;

CREATE POLICY payment_proofs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND public.current_user_role() IN ('STAFF', 'ADMIN')
  );

CREATE POLICY payment_proofs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND public.current_user_role() IN ('STAFF', 'ADMIN')
  );

-- ─────────────────────────────────────────────────────────────────
-- Realtime — already added in the payment_documents migration,
-- but re-run idempotently in case that migration ran before this
-- one on a fresh database.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "PaymentDocument" REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "PaymentDocument";
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
