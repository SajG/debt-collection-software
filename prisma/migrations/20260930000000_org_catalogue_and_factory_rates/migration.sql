-- SY24 — per-org catalogue pick lists + factory rate visibility.
--
-- brandList  : JSONB array of strings (brand chips shown in the
--              mobile order wizard). NULL = fall back to starter
--              list in mobile/src/lib/constants.ts.
-- packingList: same shape for packing chips.
-- factoryCanSeeRates : bool. When false the FACTORY home hides
--                      productRate/orderValue. Synergy uses a
--                      FACTORY-role accountant for invoicing, so we
--                      flip Synergy's row true.
--
-- The starter values for Synergy come straight from the old
-- constants (BRAND_LIST, COMMON_PACKINGS) so nothing changes for the
-- pilot tenant.

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "brandList"          JSONB,
  ADD COLUMN IF NOT EXISTS "packingList"        JSONB,
  ADD COLUMN IF NOT EXISTS "factoryCanSeeRates" BOOLEAN NOT NULL DEFAULT false;

-- Synergy seed. IDs come out of the multi_tenant_orgs migration
-- (slug='synergy'); the update is a no-op on any other tenant.
UPDATE "BusinessSettings" bs
   SET "brandList" = to_jsonb(ARRAY[
         'Polygum',
         'Stick-Onn',
         'Polygum Industrial',
         'Omcol',
         'Ombond',
         'Private Label / Other'
       ]::text[]),
       "packingList" = to_jsonb(ARRAY[
         'Squeeze Bottle',
         'Cartridge',
         'Spray Bottle',
         'Pouch (loose)',
         'Bottle (glass / dropper)',
         'Loose Printed Drum',
         'Loose Plain Drum',
         'Pouch in Drum (60 Pouches)',
         'Pouch in Drum (50 Pouches)',
         'Pouch in Drum (48 Pouches)',
         'Loose Printed Bucket',
         'Loose Plain Bucket',
         'Pouch in Bucket (20 Pouches)',
         'Jar in Double Layer Plain Box (12 Jar)',
         'Jar in Double Layer Printed Box (12 Jar)',
         'Jar in Plain Flat Box (12 Jar)',
         'Jar in Printed Flat Box (12 Jar)',
         'Jar in Plain Box (24 Jar)',
         'Jar in Printed Box (24 Jar)',
         'Jar in Plain Box (4 Jar)',
         'Jar in Printed Box (4 Jar)',
         'Pouch in Plain Box (25 Pouches)',
         'Pouch in Printed Box (25 Pouches)',
         'Pouch in Plain Box (20 Pouches)',
         'Pouch in Printed Box (20 Pouches)',
         'Hotmelt Bag (30 KG)'
       ]::text[]),
       "factoryCanSeeRates" = true
  FROM "Organization" o
 WHERE bs."organizationId" = o.id
   AND o.slug = 'synergy';
