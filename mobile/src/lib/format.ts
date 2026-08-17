import { formatDistanceToNowStrict } from "date-fns";

/** ₹1,00,000 — Indian digit grouping. Hermes 0.75+ implements en-IN correctly. */
export function formatINR(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "₹0";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** "5 min ago", "2 hr ago". Empty string on invalid input so callers can decide fallback. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return "";
  }
}

/** "12 Aug 2026". */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "12 Aug 2026, 3:45 PM". */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return (
    date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  );
}
