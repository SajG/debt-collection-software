import type { OrderStatus } from "./database.types";

// Brief-mandated palette. Kept in one place so the badge, timeline, and
// any future dashboard use the same colour for the same state.
export function statusStyle(status: OrderStatus): {
  bg: string;
  fg: string;
} {
  switch (status) {
    case "PENDING_APPROVAL":
      // Amber — held pending admin decision.
      return { bg: "#FEF3C7", fg: "#78350F" };
    case "REJECTED":
      // Red on cream — terminal negative outcome, distinct from ON_HOLD.
      return { bg: "#FEE2E2", fg: "#991B1B" };
    case "ORDER_PLACED":
      return { bg: "#E5E7EB", fg: "#111827" }; // gray
    case "IN_PRODUCTION":
      return { bg: "#FEF3C7", fg: "#78350F" }; // amber
    case "ON_HOLD":
      // Loud red-on-cream so a held order can't be missed in a list.
      return { bg: "#FEE2E2", fg: "#991B1B" };
    case "READY_TO_DISPATCH":
      return { bg: "#DBEAFE", fg: "#1E3A8A" }; // blue
    case "LR_GENERATED":
      return { bg: "#DBEAFE", fg: "#1E3A8A" }; // blue
    case "PARTIALLY_DISPATCHED":
      // Same green family as DISPATCHED but lighter, so the two are
      // visually related but distinct at a glance.
      return { bg: "#ECFCCB", fg: "#3F6212" };
    case "DISPATCHED":
      return { bg: "#D1FAE5", fg: "#064E3B" }; // green
    case "DELIVERED":
      // Deeper green than DISPATCHED — closes the loop.
      return { bg: "#A7F3D0", fg: "#064E3B" };
    case "CANCELLED":
      return { bg: "#FEE2E2", fg: "#7F1D1D" }; // red
  }
}
