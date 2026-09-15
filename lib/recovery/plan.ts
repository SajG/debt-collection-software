import { AGING_LABELS, agingBucket } from "../ar/aging";

export type PlanReason =
  | { kind: "promise_due"; promiseDate: Date; promiseAmount: number | null }
  | { kind: "bucket_slip"; invoiceRef: string; daysToSlip: number; nextBucket: string }
  | { kind: "stale_high_risk"; daysSinceLastAction: number }
  | { kind: "top_score" };

export type PlanParty = {
  partyId: string;
  partyName: string;
  phone: string | null;
  assignedToId: string | null;
  outstanding: number;
  score: number;
  reasons: PlanReason[];
};

export type DailyPlan = {
  byStaff: Map<string, PlanParty[]>;
  unassigned: PlanParty[];
};

const SLIP_HORIZON_DAYS = 7;
const TRANSITIONS = [1, 31, 61, 91];

export function bucketSlip(
  daysOverdue: number
): { daysToSlip: number; nextBucket: string } | null {
  const next = TRANSITIONS.find((t) => t > daysOverdue);
  if (next === undefined) return null;
  const daysToSlip = next - daysOverdue;
  if (daysToSlip > SLIP_HORIZON_DAYS) return null;
  const future = new Date();
  future.setDate(future.getDate() - next);
  return { daysToSlip, nextBucket: AGING_LABELS[agingBucket(future)] };
}

const REASON_WEIGHT: Record<PlanReason["kind"], number> = {
  promise_due: 4,
  bucket_slip: 3,
  stale_high_risk: 2,
  top_score: 1,
};

function strongestWeight(p: PlanParty): number {
  return Math.max(0, ...p.reasons.map((r) => REASON_WEIGHT[r.kind]));
}

export function buildDailyPlan(
  parties: PlanParty[],
  opts: { topN: number } = { topN: 10 }
): DailyPlan {
  const reasonless = parties
    .filter((p) => p.reasons.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.topN);
  for (const p of reasonless) p.reasons.push({ kind: "top_score" });

  const included = parties.filter((p) => p.reasons.length > 0);
  included.sort((a, b) => strongestWeight(b) - strongestWeight(a) || b.score - a.score);

  const byStaff = new Map<string, PlanParty[]>();
  const unassigned: PlanParty[] = [];
  for (const p of included) {
    if (p.assignedToId === null) {
      unassigned.push(p);
    } else {
      const list = byStaff.get(p.assignedToId) ?? [];
      list.push(p);
      byStaff.set(p.assignedToId, list);
    }
  }
  return { byStaff, unassigned };
}
