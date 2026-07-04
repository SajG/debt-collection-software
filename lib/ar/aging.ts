// Pure aging-bucket helpers — no DB access, unit-tested.

export const AGING_BUCKETS = [
  "current",
  "d0_30",
  "d31_60",
  "d61_90",
  "d90_plus",
] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Not yet due",
  d0_30: "0–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d90_plus: "90+ days",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days past due; 0 when due today, negative when not yet due. */
export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - due.getTime()) / MS_PER_DAY);
}

export function agingBucket(dueDate: Date, now: Date = new Date()): AgingBucket {
  const days = daysOverdue(dueDate, now);
  if (days <= 0) return "current";
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

export type AgingSummary = Record<AgingBucket, number>;

/** Sum pending amounts (total − paid) into aging buckets. */
export function agingSummary(
  invoices: { dueDate: Date; pending: number }[],
  now: Date = new Date()
): AgingSummary {
  const summary: AgingSummary = {
    current: 0,
    d0_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
  };
  for (const inv of invoices) {
    if (inv.pending <= 0) continue;
    summary[agingBucket(inv.dueDate, now)] += inv.pending;
  }
  return summary;
}
