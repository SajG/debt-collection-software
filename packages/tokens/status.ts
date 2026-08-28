// Single-source status vocabulary for order chips.
//
// Both mobile/src/lib/status-style.ts and any web usage import from
// here so an order at "PENDING_APPROVAL" renders with the same colour
// pair and the same label wherever it appears. Colour choices sit on
// the Syncit ramp defined in packages/tokens/tokens.json:
//
//   informational  → bench + inkMuted  (grey neutral)
//   warning        → curBg + cure      (amber, needs someone's attention)
//   error/hold     → faultBg + fault   (red, action blocked)
//   progress       → bench + kiln      (teal, in motion)
//   complete       → set + bond        (green, closed loop)
//
// If a status is added to the DB enum, add a branch here — a
// switch-exhaustiveness check at the bottom will fail the build until
// it is.

export type OrderStatus =
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "ORDER_PLACED"
  | "IN_PRODUCTION"
  | "ON_HOLD"
  | "READY_TO_DISPATCH"
  | "LR_GENERATED"
  | "PARTIALLY_DISPATCHED"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED";

export type StatusStyle = {
  /** Chip background */
  bg: string;
  /** Chip text (also OK for a leading dot) */
  fg: string;
  /** Human-readable label — Title Case, safe on a chip up to ~20 chars. */
  label: string;
  /** Coarse severity — useful for sort / filter / icon selection. */
  tone: "info" | "warn" | "error" | "progress" | "done";
};

const RAMP = {
  bench: "#F5F7F6",
  ink: "#0B1D18",
  inkMuted: "#5A6B65",
  curBg: "#FEF3C7",
  cure: "#78350F", // darker cure for AA contrast on curBg
  faultBg: "#FEE4E2",
  fault: "#8A1B12", // darker fault for AA contrast on faultBg
  kiln: "#12876C",
  set: "#D1FAE5", // set light for chip bg
  bond: "#093D30",
} as const;

export function orderStatusStyle(status: OrderStatus): StatusStyle {
  switch (status) {
    case "PENDING_APPROVAL":
      return {
        bg: RAMP.curBg,
        fg: RAMP.cure,
        label: "Awaiting approval",
        tone: "warn",
      };
    case "REJECTED":
      return {
        bg: RAMP.faultBg,
        fg: RAMP.fault,
        label: "Rejected",
        tone: "error",
      };
    case "ORDER_PLACED":
      return {
        bg: RAMP.bench,
        fg: RAMP.inkMuted,
        label: "Placed",
        tone: "info",
      };
    case "IN_PRODUCTION":
      return {
        bg: RAMP.bench,
        fg: RAMP.kiln,
        label: "In production",
        tone: "progress",
      };
    case "ON_HOLD":
      return {
        bg: RAMP.faultBg,
        fg: RAMP.fault,
        label: "On hold",
        tone: "error",
      };
    case "READY_TO_DISPATCH":
      return {
        bg: RAMP.bench,
        fg: RAMP.kiln,
        label: "Ready to dispatch",
        tone: "progress",
      };
    case "LR_GENERATED":
      return {
        bg: RAMP.bench,
        fg: RAMP.kiln,
        label: "LR generated",
        tone: "progress",
      };
    case "PARTIALLY_DISPATCHED":
      return {
        bg: RAMP.set,
        fg: RAMP.bond,
        label: "Partly dispatched",
        tone: "progress",
      };
    case "DISPATCHED":
      return {
        bg: RAMP.set,
        fg: RAMP.bond,
        label: "Dispatched",
        tone: "done",
      };
    case "DELIVERED":
      return {
        bg: RAMP.set,
        fg: RAMP.bond,
        label: "Delivered",
        tone: "done",
      };
    case "CANCELLED":
      return {
        bg: RAMP.bench,
        fg: RAMP.inkMuted,
        label: "Cancelled",
        tone: "info",
      };
    default: {
      // Exhaustiveness check — if the OrderStatus union gains a
      // member, TypeScript flags this line at compile time and the
      // build refuses. Do not remove.
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Ordered severity for sorting a list "worst first". */
export const TONE_WEIGHT: Record<StatusStyle["tone"], number> = {
  error: 4,
  warn: 3,
  progress: 2,
  info: 1,
  done: 0,
};
