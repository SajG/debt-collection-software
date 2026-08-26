-- order_documents_scoped_read
--
-- Before this migration, `order_documents_select` allowed any
-- STAFF/FACTORY/ADMIN to read any object in the `order-documents`
-- bucket. Salesperson A could therefore read salesperson B's customer
-- invoices — a data-leak between salespeople.
--
-- Fix: keep FACTORY + ADMIN broad, restrict STAFF to objects whose
-- owning SalesOrder has salespersonId = auth.uid().
--
-- Path scheme: `<salesOrderId>/<timestamp>-<filename>`. This is what
-- `uploadLocalFileToBucket` already produces (scopePrefix = orderId,
-- see mobile/src/lib/uploads.ts). Existing objects already conform,
-- so no rename pass is required.
--
-- We still need one SalesOrder lookup per storage read to authorise
-- STAFF — a primary-key lookup on a small table, so O(1). Encoding
-- salespersonId directly into the path would avoid the lookup but
-- would strand the object if the order is ever reassigned; the join
-- is worth the trade.

DROP POLICY IF EXISTS order_documents_select ON storage.objects;

CREATE POLICY order_documents_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'order-documents'
    AND (
      -- FACTORY and ADMIN can see every order's docs — they act on
      -- them (LR generation, invoice attachment) across the org.
      public.current_user_role() IN ('FACTORY', 'ADMIN')
      OR (
        public.current_user_role() = 'STAFF'
        AND EXISTS (
          SELECT 1 FROM "SalesOrder" so
          WHERE so."id" = split_part(storage.objects.name, '/', 1)
            AND so."salespersonId" = auth.uid()
        )
      )
    )
  );

-- Sanity check: reject any object whose path does not start with a
-- non-empty first segment (the salesOrderId). Blocks accidental
-- uploads to the bucket root, which would bypass the STAFF scope
-- check above (split_part returns "" and the EXISTS is false, so
-- STAFF is safely excluded, but a factory user could still see a
-- garbage upload — this policy is defence in depth).
DROP POLICY IF EXISTS order_documents_insert ON storage.objects;

CREATE POLICY order_documents_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-documents'
    AND public.current_user_role() IN ('STAFF', 'FACTORY', 'ADMIN')
    AND length(split_part(storage.objects.name, '/', 1)) > 0
    -- STAFF-only insert scope: matches the OrderDocument row policy
    -- in 20260813150000_rls_order_document_staff_insert. Non-STAFF
    -- pass through the second predicate above.
    AND (
      public.current_user_role() IN ('FACTORY', 'ADMIN')
      OR EXISTS (
        SELECT 1 FROM "SalesOrder" so
        WHERE so."id" = split_part(storage.objects.name, '/', 1)
          AND so."salespersonId" = auth.uid()
      )
    )
  );
