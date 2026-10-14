// Which customers get an automated reminder today, and about which
// invoice. Pure — no DB, no sending. The cron feeds the result to
// sendReminder(), where the gate (consent, pause, quiet hours, daily and
// weekly caps) still has the final say on every single message.
//
// One reminder per customer per day at most, chosen in this order:
//   1. overdue    — the oldest unpaid invoice past its due date
//   2. due_today  — an invoice due today
//   3. upcoming   — an invoice due in exactly UPCOMING_DAYS days
// "Today" is the calendar day in the company's own timezone.

export type ReminderKind = "overdue" | "due_today" | "upcoming";

export const UPCOMING_DAYS = 3;

export type ReminderInvoice = {
  id: string;
  partyId: string;
  dueDate: Date;
  /** total − paid − credited */
  pending: number;
};

export type PlannedReminder = { partyId: string; invoiceId: string; kind: ReminderKind };

/** YYYY-MM-DD of `date` in `timeZone`. */
export function localDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days from day key `a` to day key `b` (b − a). */
function dayDiff(a: string, b: string): number {
  const ms = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

export function reminderKindFor(dueDate: Date, now: Date, timeZone: string): ReminderKind | null {
  const daysUntilDue = dayDiff(localDayKey(now, timeZone), localDayKey(dueDate, timeZone));
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue === 0) return "due_today";
  if (daysUntilDue === UPCOMING_DAYS) return "upcoming";
  return null;
}

const PRIORITY: Record<ReminderKind, number> = { overdue: 0, due_today: 1, upcoming: 2 };

export function planReminders(
  invoices: ReminderInvoice[],
  now: Date,
  timeZone: string,
): PlannedReminder[] {
  const best = new Map<string, { inv: ReminderInvoice; kind: ReminderKind }>();
  for (const inv of invoices) {
    if (!(inv.pending > 0)) continue;
    const kind = reminderKindFor(inv.dueDate, now, timeZone);
    if (!kind) continue;
    const current = best.get(inv.partyId);
    const better =
      !current ||
      PRIORITY[kind] < PRIORITY[current.kind] ||
      (PRIORITY[kind] === PRIORITY[current.kind] && inv.dueDate < current.inv.dueDate);
    if (better) best.set(inv.partyId, { inv, kind });
  }
  return Array.from(best.values()).map(({ inv, kind }) => ({
    partyId: inv.partyId,
    invoiceId: inv.id,
    kind,
  }));
}
