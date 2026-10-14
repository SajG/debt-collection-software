// Monday email to management (SY29): where the money stands and who
// needs a call. Pure — the cron loads the rows, this adds them up.
// Tested in lib/recovery/__tests__/weekly.test.ts.

const DAY = 24 * 60 * 60 * 1000;

export type WeeklyInvoice = {
  partyId: string;
  dueDate: Date;
  totalAmount: number;
  /** Every payment and (non-cancelled) credit note against this invoice. */
  settlements: { at: Date; amount: number }[];
};

export type WeeklyParty = {
  id: string;
  name: string;
  outstanding: number;
  salesperson: string | null;
};

export type WeeklyBrokenPromise = {
  partyId: string;
  promiseDate: Date;
  promiseAmount: number | null;
};

export type WeeklySummary = {
  outstanding: number;
  overdueNow: number;
  overdueLastWeek: number;
  /** overdueNow − overdueLastWeek. Negative is good. */
  overdueChange: number;
  /** null when there was nothing overdue a week ago. */
  overdueChangePct: number | null;
  receivedThisWeek: number;
  receivedThisMonth: number;
  /** Sum of this month's targets; 0 = none set. */
  monthTarget: number;
  /** receivedThisMonth / monthTarget; null without a target. */
  targetPct: number | null;
  topOverdue: { name: string; overdue: number; daysOverdue: number; salesperson: string | null }[];
  brokenPromises: {
    name: string;
    promiseDate: Date;
    promiseAmount: number | null;
    outstanding: number;
    salesperson: string | null;
  }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Unpaid amount, per customer, on invoices already past due at `asOf`
 *  — counting only money that had arrived by then. */
export function overdueAsOf(invoices: WeeklyInvoice[], asOf: Date): Map<string, { amount: number; oldestDue: Date }> {
  const startOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const out = new Map<string, { amount: number; oldestDue: Date }>();
  for (const inv of invoices) {
    if (inv.dueDate >= startOfDay) continue;
    const settled = inv.settlements.reduce((s, x) => (x.at <= asOf ? s + x.amount : s), 0);
    const pending = round2(inv.totalAmount - settled);
    if (pending <= 0) continue;
    const cur = out.get(inv.partyId);
    out.set(inv.partyId, {
      amount: round2((cur?.amount ?? 0) + pending),
      oldestDue: cur && cur.oldestDue < inv.dueDate ? cur.oldestDue : inv.dueDate,
    });
  }
  return out;
}

export function buildWeeklySummary(input: {
  now: Date;
  parties: WeeklyParty[];
  /** Non-cancelled invoices due before `now` (paid ones included, so
   *  last week's position can be rebuilt). */
  invoices: WeeklyInvoice[];
  /** Payments in the current month: [date, amount]. */
  paymentsThisMonth: { at: Date; amount: number }[];
  monthTarget: number;
  brokenPromises: WeeklyBrokenPromise[];
}): WeeklySummary {
  const { now } = input;
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const party = new Map(input.parties.map((p) => [p.id, p]));

  const nowMap = overdueAsOf(input.invoices, now);
  const thenMap = overdueAsOf(input.invoices, weekAgo);
  const sum = (m: Map<string, { amount: number }>) =>
    round2(Array.from(m.values()).reduce((s, v) => s + v.amount, 0));
  const overdueNow = sum(nowMap);
  const overdueLastWeek = sum(thenMap);

  const receivedThisMonth = round2(input.paymentsThisMonth.reduce((s, p) => s + p.amount, 0));
  const receivedThisWeek = round2(
    input.paymentsThisMonth.reduce((s, p) => (p.at >= weekAgo ? s + p.amount : s), 0),
  );

  const topOverdue = Array.from(nowMap.entries())
    .map(([partyId, v]) => ({
      name: party.get(partyId)?.name ?? "Unknown customer",
      overdue: v.amount,
      daysOverdue: Math.max(1, Math.round((now.getTime() - v.oldestDue.getTime()) / DAY)),
      salesperson: party.get(partyId)?.salesperson ?? null,
    }))
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 10);

  const brokenPromises = input.brokenPromises
    .map((b) => ({
      name: party.get(b.partyId)?.name ?? "Unknown customer",
      promiseDate: b.promiseDate,
      promiseAmount: b.promiseAmount,
      outstanding: party.get(b.partyId)?.outstanding ?? 0,
      salesperson: party.get(b.partyId)?.salesperson ?? null,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 15);

  return {
    outstanding: round2(input.parties.reduce((s, p) => s + Math.max(0, p.outstanding), 0)),
    overdueNow,
    overdueLastWeek,
    overdueChange: round2(overdueNow - overdueLastWeek),
    overdueChangePct:
      overdueLastWeek > 0 ? Math.round(((overdueNow - overdueLastWeek) / overdueLastWeek) * 1000) / 10 : null,
    receivedThisWeek,
    receivedThisMonth,
    monthTarget: input.monthTarget,
    targetPct: input.monthTarget > 0 ? Math.round((receivedThisMonth / input.monthTarget) * 1000) / 10 : null,
    topOverdue,
    brokenPromises,
  };
}

/** Nothing owed, nothing received: not worth an email. */
export function weeklySummaryIsEmpty(s: WeeklySummary): boolean {
  return s.outstanding <= 0 && s.receivedThisMonth <= 0 && s.overdueLastWeek <= 0;
}
