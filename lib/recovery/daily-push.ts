// The 9:00 push to each salesperson: "Today: 6 customers, ₹3.4L to
// follow up". Pure helpers — the cron (app/api/cron/daily-followups)
// loads the data and the notify edge function delivers.

/** ₹3.4L, ₹1.2Cr, ₹45K, ₹900 — short enough for a notification. */
export function compactINR(amount: number): string {
  const n = Math.max(0, Math.round(amount));
  const trim = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ""));
  if (n >= 1_00_00_000) return `₹${trim(n / 1_00_00_000)}Cr`;
  if (n >= 1_00_000) return `₹${trim(n / 1_00_000)}L`;
  if (n >= 1_000) return `₹${trim(n / 1_000)}K`;
  return `₹${n}`;
}

export function dailyPushText(customers: number, amount: number): { title: string; body: string } {
  return {
    title: "Today",
    body: `${customers} ${customers === 1 ? "customer" : "customers"}, ${compactINR(amount)} to follow up`,
  };
}

/** Sunday in the company's own timezone — no push that day. */
export function isSundayIn(now: Date, timeZone: string): boolean {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now) === "Sun"
  );
}

export type DailyPushRecipient = { profileId: string; title: string; body: string };

/** One recipient per salesperson who has at least one customer to
 *  follow up; nobody gets an "all clear" push. */
export function dailyPushRecipients(
  byStaff: Map<string, { outstanding: number }[]>,
  activeStaffIds: ReadonlySet<string>,
): DailyPushRecipient[] {
  const out: DailyPushRecipient[] = [];
  for (const [profileId, rows] of Array.from(byStaff.entries())) {
    if (!activeStaffIds.has(profileId) || rows.length === 0) continue;
    const amount = rows.reduce((s, r) => s + r.outstanding, 0);
    out.push({ profileId, ...dailyPushText(rows.length, amount) });
  }
  return out;
}
