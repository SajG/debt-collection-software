-- product_grade_codes
--
-- Add Product.code — the factory-side grade name that maps to a
-- salesperson-facing product name. Salespeople think "Polygum D3+";
-- the factory sees "WR-48" on the batch. Both need to be findable
-- from either side.
--
-- Also seeds a small case-insensitive search index on name + code.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "code" TEXT;

CREATE INDEX IF NOT EXISTS product_name_lower_idx ON "Product" (lower(name));
CREATE INDEX IF NOT EXISTS product_code_lower_idx ON "Product" (lower(code));

-- Also normalise the "Stick-onn" brand casing to the marketing-canonical
-- "Stick-Onn" in one place. Mobile BRAND_LIST is being updated to match.
UPDATE "Product" SET brand = 'Stick-Onn' WHERE brand = 'Stick-onn';
