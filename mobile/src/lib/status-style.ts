import type { OrderStatus } from "./database.types";

// Brief-mandated palette. Kept in one place so the badge, timeline, and
// any future dashboard use the same colour for the same state.
export function statusStyle(status: OrderStatus): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case "ORDER_PLACED":
      return { bg: "#E5E7EB", fg: "#111827" }; // gray
    case "IN_PRODUCTION":
      return { bg: "#FEF3C7", fg: "#78350F" }; // amber
    case "READY_TO_DISPATCH":
      return { bg: "#DBEAFE", fg: "#1E3A8A" }; // blue
    case "LR_GENERATED":
    case "DISPATCHED":
      return { bg: "#D1FAE5", fg: "#064E3B" }; // green
    case "CANCELLED":
      return { bg: "#FEE2E2", fg: "#7F1D1D" }; // red
  }
}
