-- order_document_pages
--
-- A 3-page LR should be ONE document with 3 images, not 3 loose
-- documents. Rather than introducing a parent table, we add
-- pageGroupId (nullable text) and pageIndex (nullable int) to
-- OrderDocument and let the UI treat rows with the same pageGroupId
-- as a single logical document.
--
-- Nullable so existing rows aren't disturbed. The client sets both
-- for every new upload (pageGroupId even for single-page captures so
-- the "add another page later" flow works retroactively).

ALTER TABLE "OrderDocument"
  ADD COLUMN "pageGroupId" text,
  ADD COLUMN "pageIndex"   integer;

CREATE INDEX "OrderDocument_pageGroupId_idx"
  ON "OrderDocument"("pageGroupId");
