-- Allow STAFF (salespersons) to attach order proof documents to their
-- own orders from the mobile app. FACTORY / ADMIN keep their broader
-- write access via the existing policies.
--
-- Type restriction (ORDER_PROOF / OTHER only for STAFF) mirrors the
-- server action in app/(dashboard)/production/actions.ts so that both
-- the web action route and direct Supabase writes stay consistent.

DROP POLICY IF EXISTS order_document_insert_staff ON "OrderDocument";

CREATE POLICY order_document_insert_staff ON "OrderDocument"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'STAFF'
    AND "uploadedById" = auth.uid()
    AND "type" IN ('ORDER_PROOF', 'OTHER')
    AND EXISTS (
      SELECT 1 FROM "SalesOrder" so
      WHERE so.id = "OrderDocument"."salesOrderId"
        AND so."salespersonId" = auth.uid()
    )
  );

-- Storage bucket + policies for order-documents. Bucket + policies for
-- payment-proofs went in earlier; treat this the same way so mobile can
-- upload without going through the web server.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-documents',
  'order-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS order_documents_insert ON storage.objects;
DROP POLICY IF EXISTS order_documents_select ON storage.objects;

CREATE POLICY order_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-documents'
    AND public.current_user_role() IN ('STAFF', 'FACTORY', 'ADMIN')
  );

CREATE POLICY order_documents_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-documents'
    AND public.current_user_role() IN ('STAFF', 'FACTORY', 'ADMIN')
  );
