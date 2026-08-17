import type {
  OrderStatus,
  PaymentTerm,
  QuantityUnit,
  TransportType,
} from "./database.types";

// Small pick lists, on-screen only. Prisma stores packing/size as free
// text (real values are informal) so the "Other" escape hatch stays.

// Brand tiles on the mobile wizard. Kept as a static list because the
// Product.brand hint on individual products isn't the source of truth —
// generic materials (PA-10 etc.) ship under any brand's packaging, and
// the salesperson picks the brand at order time.
export const BRAND_LIST: readonly string[] = [
  "Polygum",
  "Ombond",
  "Omcol",
  "Stick-onn",
];

// Verbatim from the Google Form "Packing?" dropdown (20 options).
export const COMMON_PACKINGS: readonly string[] = [
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
];

// Verbatim from the form "Size in Kg" (21 options, largest → smallest).
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
  "0.25",
];

// Verbatim from the form "Token or Gift?" — free string on the wire so
// the DB matches whatever the salesperson picked.
export const TOKEN_TYPES: readonly string[] = [
  "With Synergy Barcode Token",
  "With Customer Token",
  "Without Token",
  "Gift inside",
];

export const QUANTITY_UNITS: readonly QuantityUnit[] = ["KG", "PCS", "NOS"];

export const PAYMENT_TERMS: readonly {
  value: PaymentTerm;
  label: string;
}[] = [
  { value: "ADVANCE", label: "Advance" },
  { value: "CREDIT", label: "Credit" },
  { value: "PDC", label: "PDC" },
  { value: "IMMEDIATE", label: "Immediate" },
  { value: "AGAINST_DISPATCH", label: "Against dispatch" },
  { value: "OTHER", label: "Other" },
];

export const TRANSPORT_TYPES: readonly {
  value: TransportType;
  label: string;
}[] = [
  { value: "PAID", label: "Paid" },
  { value: "TO_PAY", label: "To pay" },
  { value: "GODOWN", label: "Godown" },
  { value: "DOOR", label: "Door" },
  { value: "OTHER", label: "Other" },
];

// The linear progression on the delivery-tracker timeline. CANCELLED
// isn't in this list because it's a terminal branch shown separately.
export const STATUS_PIPELINE: readonly OrderStatus[] = [
  "ORDER_PLACED",
  "IN_PRODUCTION",
  "READY_TO_DISPATCH",
  "LR_GENERATED",
  "DISPATCHED",
];
