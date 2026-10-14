import { dateLocale, t, tn } from "./i18n";

/** ₹1,00,000 — Indian digit grouping. Hermes 0.75+ implements en-IN correctly. */
export function formatINR(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "₹0";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** "5 minutes ago", "2 hours ago" in the app language. Empty string on
 *  invalid input so callers can decide the fallback. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return t("time.justNow");
  if (min < 60) return tn("time.minutesAgo", min);
  const hr = Math.round(min / 60);
  if (hr < 24) return tn("time.hoursAgo", hr);
  return tn("time.daysAgo", Math.round(hr / 24));
}

/** "12 Aug 2026". */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(dateLocale(), {
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
    date.toLocaleDateString(dateLocale(), {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    date.toLocaleTimeString(dateLocale(), {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  );
}
