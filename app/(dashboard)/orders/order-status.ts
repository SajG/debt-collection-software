import type { OrderStatus } from "@prisma/client";
import type { BadgeTone } from "../_components/ui";

export function orderStatusTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case "DISPATCHED":
      return "success";
    case "READY_TO_DISPATCH":
    case "LR_GENERATED":
      return "amber";
    case "CANCELLED":
      return "danger";
    case "IN_PRODUCTION":
      return "info";
    case "ORDER_PLACED":
    default:
      return "neutral";
  }
}

// Human-readable label for status transitions on the factory tap targets.
export function nextStatusLabel(current: OrderStatus): string | null {
  switch (current) {
    case "ORDER_PLACED":
      return "Start production";
    case "IN_PRODUCTION":
      return "Mark ready";
    case "READY_TO_DISPATCH":
      return "Generate LR";
    case "LR_GENERATED":
      return "Dispatch";
    default:
      return null;
  }
}

export function nextStatus(current: OrderStatus): OrderStatus | null {
  switch (current) {
    case "ORDER_PLACED":
      return "IN_PRODUCTION";
    case "IN_PRODUCTION":
      return "READY_TO_DISPATCH";
    case "READY_TO_DISPATCH":
      return "LR_GENERATED";
    case "LR_GENERATED":
      return "DISPATCHED";
    default:
      return null;
  }
}
