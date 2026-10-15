-- storage_tenant_paths (go-live fix, 2026-10-15)
--
-- Problem: the SY22 storage policies require every object path to
-- start with the company id and cast that first segment to uuid:
--     split_part(name, '/', 1)::uuid = public.current_org_id()
-- But order documents and payment proofs have always been stored as
--     <salesOrderId>/<file>   and   <paymentId>/<file>
-- (lib/storage.ts), and those ids are cuids, not uuids. For a signed-in
-- phone the cast raises "invalid input syntax for type uuid", so every
-- createSignedUrl from the app failed: nobody could open an invoice,
-- LR or payment-proof photo on mobile.
--
-- Fix: same RESTRICTIVE company rule, written with text comparisons:
-- an object is in the caller's company when its first path segment is
--   * the company id itself (future layout), or
--   * an order (order-documents) / payment (payment-proofs) of that
--     company — the layout that exists today.
-- No cast, so no error. The permissive per-bucket policies that decide
-- WHO in the company may read are unchanged. Server code uses the
-- service role and is unaffected.

DROP POLICY IF EXISTS "sy22_tenant_order-documents" ON storage.objects;
CREATE POLICY "sy22_tenant_order-documents" ON storage.objects
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    bucket_id <> 'order-documents'
    OR split_part(name, '/', 1) = public.current_org_id()::text
    OR EXISTS (
      SELECT 1 FROM "SalesOrder" so
       WHERE so.id = split_part(storage.objects.name, '/', 1)
         AND so."organizationId" = public.current_org_id()
    )
  )
  WITH CHECK (
    bucket_id <> 'order-documents'
    OR split_part(name, '/', 1) = public.current_org_id()::text
    OR EXISTS (
      SELECT 1 FROM "SalesOrder" so
       WHERE so.id = split_part(storage.objects.name, '/', 1)
         AND so."organizationId" = public.current_org_id()
    )
  );

DROP POLICY IF EXISTS "sy22_tenant_payment-proofs" ON storage.objects;
CREATE POLICY "sy22_tenant_payment-proofs" ON storage.objects
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    bucket_id <> 'payment-proofs'
    OR split_part(name, '/', 1) = public.current_org_id()::text
    OR EXISTS (
      SELECT 1 FROM "Payment" p
       WHERE p.id = split_part(storage.objects.name, '/', 1)
         AND p."organizationId" = public.current_org_id()
    )
  )
  WITH CHECK (
    bucket_id <> 'payment-proofs'
    OR split_part(name, '/', 1) = public.current_org_id()::text
    OR EXISTS (
      SELECT 1 FROM "Payment" p
       WHERE p.id = split_part(storage.objects.name, '/', 1)
         AND p."organizationId" = public.current_org_id()
    )
  );

-- Company logos are written and read by the server only; keep the
-- company-prefix rule but without the failing cast.
DROP POLICY IF EXISTS "sy22_tenant_company-logos" ON storage.objects;
CREATE POLICY "sy22_tenant_company-logos" ON storage.objects
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    bucket_id <> 'company-logos'
    OR split_part(name, '/', 1) = public.current_org_id()::text
  )
  WITH CHECK (
    bucket_id <> 'company-logos'
    OR split_part(name, '/', 1) = public.current_org_id()::text
  );
