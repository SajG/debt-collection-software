import { format } from "date-fns";

type Numeric = number | string | { toString(): string };

export function toNumber(v: Numeric): number {
  return typeof v === "number" ? v : Number(v.toString());
}

export function formatINR(v: Numeric): string {
  const n = toNumber(v);
  return (
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}

export function formatDate(d: Date): string {
  return format(d, "d MMM yyyy");
}

export function formatDateTime(d: Date): string {
  return format(d, "d MMM yyyy, h:mm a");
}


/** Size as entered on an order line. Plain numbers are kilograms (the
 *  catalogue chips); anything else ("310 ml", "XL", "6 ft") is shown as
 *  typed, so " kg" is never glued onto a non-weight size. */
export function formatSize(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "";
  return /^\d+(\.\d+)?$/.test(s) ? `${s} kg` : s;
}
