import type {
  OrderStatus,
  PaymentTerm,
  Role,
  TransportType,
} from "./database.types";
import { formatDate } from "./format";
import { t, tn, type Key } from "./i18n";

// Display names for enum values. The database keeps the English enum;
// only what is shown on screen is translated. These are functions, not
// module-level tables, so they follow the language chosen in Settings.

const PAYMENT_TERM_VALUES: readonly string[] = [
  "ADVANCE",
  "CREDIT",
  "PDC",
  "IMMEDIATE",
  "AGAINST_DISPATCH",
  "OTHER",
];
const TRANSPORT_VALUES: readonly string[] = ["PAID", "TO_PAY", "GODOWN", "DOOR", "OTHER"];

export function statusLabel(status: OrderStatus): string {
  return t(`status.${status}` as Key);
}

export function paymentTermLabel(v: PaymentTerm | string | null | undefined): string {
  if (!v) return "—";
  return PAYMENT_TERM_VALUES.includes(v) ? t(`paymentTerm.${v}` as Key) : v;
}

export function transportLabel(v: TransportType | string | null | undefined): string {
  if (!v) return "—";
  return TRANSPORT_VALUES.includes(v) ? t(`transport.${v}` as Key) : v;
}

export type PaymentMethodValue = "CASH" | "CHEQUE" | "NEFT" | "RTGS" | "UPI" | "OTHER";
export function paymentMethodLabel(v: PaymentMethodValue): string {
  return t(`paymentMethod.${v}` as Key);
}

export type PaymentDocTypeValue =
  | "BANK_SCREENSHOT"
  | "CHEQUE_PHOTO"
  | "UPI_SCREENSHOT"
  | "RECEIPT"
  | "OTHER";
export function paymentDocLabel(v: PaymentDocTypeValue): string {
  return t(`paymentDoc.${v}` as Key);
}

export type OrderDocTypeValue = "INVOICE" | "LORRY_RECEIPT" | "ORDER_PROOF" | "OTHER";
export function orderDocLabel(v: OrderDocTypeValue): string {
  return t(`orderDoc.${v}` as Key);
}

export function holdReasonLabel(v: string | null | undefined): string {
  switch (v) {
    case "RAW_MATERIAL_SHORTAGE":
      return t("holdReason.RAW_MATERIAL_SHORTAGE");
    case "AWAITING_CUSTOMER_CONFIRMATION":
      return t("holdReason.AWAITING_CUSTOMER_CONFIRMATION");
    case "PAYMENT_HOLD":
      return t("holdReason.PAYMENT_HOLD");
    default:
      return t("holdReason.OTHER");
  }
}

export function lineStatusLabel(v: "PENDING" | "IN_PRODUCTION" | "READY"): string {
  return t(`lineStatus.${v}` as Key);
}

export function roleLabel(role: Role | null | undefined): string {
  if (!role) return "—";
  return t(`role.${role}` as Key);
}

/** PAYMENT_TERMS / TRANSPORT_TYPES with labels in the current language. */
export function paymentTerms(): { value: PaymentTerm; label: string }[] {
  return (PAYMENT_TERM_VALUES as readonly PaymentTerm[]).map((value) => ({
    value,
    label: paymentTermLabel(value),
  }));
}

export function transportTypes(): { value: TransportType; label: string }[] {
  return (TRANSPORT_VALUES as readonly TransportType[]).map((value) => ({
    value,
    label: transportLabel(value),
  }));
}

/** "Saved 12 Aug 2026 · 2 retries" under a row in the sync sheet. */
export function queuedMeta(queuedAt: string | number, attempts: number): string {
  const base = t("sync.queuedMeta", { date: formatDate(new Date(queuedAt)) });
  return attempts > 0 ? `${base} · ${tn("sync.retries", attempts)}` : base;
}
