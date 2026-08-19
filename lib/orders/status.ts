import type { OrderStatus, DocumentType } from "@prisma/client";

/** Happy-path factory pipeline. CANCELLED / ON_HOLD /
 *  PARTIALLY_DISPATCHED are side branches and not in this list. */
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  "ORDER_PLACED",
  "IN_PRODUCTION",
  "READY_TO_DISPATCH",
  "LR_GENERATED",
  "DISPATCHED",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "In production",
  ON_HOLD: "On hold",
  READY_TO_DISPATCH: "Ready to dispatch",
  LR_GENERATED: "LR generated",
  PARTIALLY_DISPATCHED: "Partially dispatched",
  DISPATCHED: "Dispatched",
  CANCELLED: "Cancelled",
};

export const NEXT_STATUS_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  ORDER_PLACED: "Start production",
  IN_PRODUCTION: "Mark ready to dispatch",
  READY_TO_DISPATCH: "Mark LR generated",
  LR_GENERATED: "Mark dispatched",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: "Invoice",
  LORRY_RECEIPT: "Lorry receipt",
  ORDER_PROOF: "Order proof",
  OTHER: "Other",
};

export function nextOrderStatus(current: OrderStatus): OrderStatus | null {
  // ON_HOLD / PARTIALLY_DISPATCHED aren't on the linear path — their
  // exits are release-hold and record-another-dispatch-lot respectively.
  if (current === "ON_HOLD" || current === "PARTIALLY_DISPATCHED") return null;
  const idx = ORDER_STATUS_SEQUENCE.indexOf(current);
  if (idx < 0 || idx >= ORDER_STATUS_SEQUENCE.length - 1) return null;
  return ORDER_STATUS_SEQUENCE[idx + 1];
}

export function customerName(order: {
  party?: { name: string } | null;
  newCustomerName?: string | null;
}): string {
  return order.party?.name || order.newCustomerName || "Unknown customer";
}

/** Calendar-day comparison in local time for delivery highlighting. */
export function deliveryUrgency(
  expected: Date | null | undefined,
  now = new Date()
): "overdue" | "today" | "upcoming" | null {
  if (!expected) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDelivery = new Date(
    expected.getFullYear(),
    expected.getMonth(),
    expected.getDate()
  );
  const diffDays = Math.round(
    (startOfDelivery.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  return "upcoming";
}
