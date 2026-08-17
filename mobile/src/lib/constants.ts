import type {
  OrderStatus,
  PaymentTerm,
  QuantityUnit,
  TransportType,
} from "./database.types";

// Small pick lists, on-screen only. Prisma stores packing/size as free
// text (real values are informal) so the "Other" escape hatch stays.

export const COMMON_PACKINGS: readonly string[] = [
  "Drum",
  "Carton",
  "Bag",
  "Tin",
  "Jar",
];

export const COMMON_SIZES_KG: readonly string[] = [
  "1",
  "5",
  "10",
  "20",
  "25",
  "50",
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
