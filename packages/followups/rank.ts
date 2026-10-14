// Who a salesperson should follow up with today, and in what order.
//
// Shared by the mobile "Today" tab (mobile/src/lib/followup-rank.ts
// re-exports this file) and the server (daily 9:00 push, Management
// "Needs you", weekly email), so the number in the push is the number
// of rows the person sees when they open the app. Pure: no React
// Native, Supabase, Prisma or date library. Tested in
// lib/__tests__/mobile-followup-rank.test.ts.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `earlier` to `later` (local time). */
function differenceInCalendarDays(later: Date, earlier: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / MS_PER_DAY);
}

export type FollowUp = {
  partyId: string;
  name: string;
  city: string | null;
  phone: string | null;
  outstanding: number;
  /** Days since the oldest unpaid invoice fell due. 0 = nothing overdue. */
  daysOverdue: number;
  /** Customer promised a date that has passed and still owes money. */
  brokenPromise: boolean;
  /** A promise falls due today. */
  promiseDueToday: boolean;
  promiseDate: string | null;
  promiseAmount: number | null;
  /** Open online-payment link for this customer, when one exists. */
  paymentLinkUrl: string | null;
};

export type PartyLite = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  totalOutstanding: number | string;
};
export type InvoiceLite = { partyId: string; dueDate: string };
export type ActionLite = {
  partyId: string;
  outcome: string | null;
  promiseDate: string | null;
  promiseAmount: number | string | null;
  performedAt: string;
};
export type LinkLite = { partyId: string; shortUrl: string; status: string; createdAt: string };

/** amount × days overdue, broken promises first. Exported for tests. */
export function rankFollowUps(rows: FollowUp[]): FollowUp[] {
  const score = (r: FollowUp) => r.outstanding * Math.max(1, r.daysOverdue);
  return [...rows].sort((a, b) => {
    if (a.brokenPromise !== b.brokenPromise) return a.brokenPromise ? -1 : 1;
    return score(b) - score(a);
  });
}

export function buildFollowUps(
  parties: PartyLite[],
  overdueInvoices: InvoiceLite[],
  actions: ActionLite[],
  links: LinkLite[],
  now: Date = new Date(),
): FollowUp[] {
  const today = startOfDay(now);

  const oldestDue = new Map<string, Date>();
  for (const inv of overdueInvoices) {
    const due = new Date(inv.dueDate);
    if (Number.isNaN(due.getTime())) continue;
    const prev = oldestDue.get(inv.partyId);
    if (!prev || due < prev) oldestDue.set(inv.partyId, due);
  }

  // Latest follow-up per customer decides the promise state — a newer
  // call replaces an older promise.
  const latest = new Map<string, ActionLite>();
  for (const a of actions) {
    const prev = latest.get(a.partyId);
    if (!prev || a.performedAt > prev.performedAt) latest.set(a.partyId, a);
  }

  const link = new Map<string, LinkLite>();
  for (const l of links) {
    const prev = link.get(l.partyId);
    if (!prev || l.createdAt > prev.createdAt) link.set(l.partyId, l);
  }

  const out: FollowUp[] = [];
  for (const p of parties) {
    const outstanding = Number(p.totalOutstanding);
    if (!Number.isFinite(outstanding) || outstanding <= 0) continue;

    const due = oldestDue.get(p.id);
    const daysOverdue = due ? Math.max(0, differenceInCalendarDays(today, due)) : 0;

    const a = latest.get(p.id);
    const promised =
      a?.outcome === "PROMISE_TO_PAY" && a.promiseDate ? new Date(a.promiseDate) : null;
    const promiseDelta = promised ? differenceInCalendarDays(today, promised) : null;
    const brokenPromise = promiseDelta !== null && promiseDelta > 0;
    const promiseDueToday = promiseDelta === 0;
    // A promise for a later day means "leave them alone until then".
    const promisedLater = promiseDelta !== null && promiseDelta < 0;

    if (promisedLater) continue;
    if (daysOverdue === 0 && !brokenPromise && !promiseDueToday) continue;

    out.push({
      partyId: p.id,
      name: p.name,
      city: p.city,
      phone: p.phone,
      outstanding,
      daysOverdue,
      brokenPromise,
      promiseDueToday,
      promiseDate: a?.promiseDate ?? null,
      promiseAmount: a?.promiseAmount == null ? null : Number(a.promiseAmount),
      paymentLinkUrl: link.get(p.id)?.shortUrl ?? null,
    });
  }
  return rankFollowUps(out);
}
