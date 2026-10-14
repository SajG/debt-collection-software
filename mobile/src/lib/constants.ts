import type { OrderStatus, QuantityUnit } from "./database.types";

// Small pick lists, on-screen only. Prisma stores packing/size as free
// text (real values are informal) so the "Other" escape hatch stays.

// Brand tiles on the mobile wizard. Kept as a static list because the
// Product.brand hint on individual products isn't the source of truth —
// generic materials (PA-10 etc.) ship under any brand's packaging, and
// the salesperson picks the brand at order time.
// Sentinel value for the private-label / custom brand flow. Picking
// this chip reveals a TextField for the actual customer-facing brand
// name; the value saved on the item is whatever the salesperson typed.
// Everything from here to the end marker is catalogue data that is
// stored on the order exactly as written (brand, packing, token type).
// It is the company's own vocabulary, not app copy, so it is not
// translated. i18n-ignore-start
export const PRIVATE_LABEL_SENTINEL = "Private Label / Other";

// Brands the shop sells today. Match the values in the Product.brand
// column exactly — the ItemSheet filters by string equality. Note the
// casing: "Stick-Onn" (marketing-canonical), not "Stick-onn".
export const BRAND_LIST: readonly string[] = [
  "Polygum",
  "Stick-Onn",
  "Polygum Industrial",
  "Omcol",
  "Ombond",
  PRIVATE_LABEL_SENTINEL,
];

// Packing options. First few are the "small pack" formats the
// Stick-Onn / Cyanoacrylate / spray SKUs ship in (squeeze bottle,
// cartridge, pouch), then the drum / bucket / jar formats from the
// Google Form. Every ItemSheet also shows a free-text "Custom packing"
// field so a salesperson can enter anything not in this list.
export const COMMON_PACKINGS: readonly string[] = [
  "Squeeze Bottle",
  "Cartridge",
  "Spray Bottle",
  "Pouch (loose)",
  "Bottle (glass / dropper)",
  "Loose Printed Drum",
  "Loose Plain Drum",
  "Pouch in Drum (60 Pouches)",
  "Pouch in Drum (50 Pouches)",
  "Pouch in Drum (48 Pouches)",
  "Loose Printed Bucket",
  "Loose Plain Bucket",
  "Pouch in Bucket (20 Pouches)",
  "Jar in Double Layer Plain Box (12 Jar)",
  "Jar in Double Layer Printed Box (12 Jar)",
  "Jar in Plain Flat Box (12 Jar)",
  "Jar in Printed Flat Box (12 Jar)",
  "Jar in Plain Box (24 Jar)",
  "Jar in Printed Box (24 Jar)",
  "Jar in Plain Box (4 Jar)",
  "Jar in Printed Box (4 Jar)",
  "Pouch in Plain Box (25 Pouches)",
  "Pouch in Printed Box (25 Pouches)",
  "Pouch in Plain Box (20 Pouches)",
  "Pouch in Printed Box (20 Pouches)",
  "Hotmelt Bag (30 KG)",
];

// Sizes in kg (large → small). Small-pack chips ("0.31", "0.45",
// "0.5", "0.8") map to the cartridge / squeeze-bottle SKUs on the
// price list (Stick-Onn Drill Free = 310 ml, Lam2Lam = 450 g, etc.).
// The ItemSheet also has a free-text "Custom size" field for anything
// off-list, and accepts both kg and ml equivalents.
export const COMMON_SIZES_KG: readonly string[] = [
  "250",
  "215",
  "200",
  "60",
  "50",
  "30",
  "25",
  "20",
  "18",
  "15",
  "10",
  "9",
  "5",
  "4.75",
  "4.5",
  "2",
  "1",
  "0.9",
  "0.8",
  "0.5",
  "0.45",
  "0.31",
  "0.25",
  "0.05",
  "0.018",
];

// Verbatim from the form "Token or Gift?" — free string on the wire so
// the DB matches whatever the salesperson picked.
export const TOKEN_TYPES: readonly string[] = [
  "With Synergy Barcode Token",
  "With Customer Token",
  "Without Token",
  "Gift inside",
];

// i18n-ignore-end

export const QUANTITY_UNITS: readonly QuantityUnit[] = ["KG", "PCS", "NOS"];

// Payment-term and transport pick lists moved to lib/labels.ts
// (paymentTerms() / transportTypes()) so their labels are translated.

// The linear progression on the delivery-tracker timeline. CANCELLED
// isn't in this list because it's a terminal branch shown separately.
export const STATUS_PIPELINE: readonly OrderStatus[] = [
  "ORDER_PLACED",
  "IN_PRODUCTION",
  "READY_TO_DISPATCH",
  "LR_GENERATED",
  "DISPATCHED",
];
