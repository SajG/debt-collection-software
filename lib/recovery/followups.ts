import type { TenantClient } from "@/lib/tenant";
import { buildFollowUps, type FollowUp } from "../../packages/followups/rank";

// Server-side view of the mobile "Today" list (SY29/SY36). Same rule
// set as the app — packages/followups/rank.ts — so the count in the
// 9:00 push is the number of rows the salesperson sees, and a broken
// promise in the weekly email is one the app shows at the top of Today.
// Always called with a tenantDb client: one company at a time.

const ACTION_LOOKBACK_DAYS = 120;
const PARTY_CAP = 5000;

export type StaffFollowUps = {
  /** Customers per assigned salesperson (Profile id). */
  byStaff: Map<string, FollowUp[]>;
  /** Customers with nobody assigned. */
  unassigned: FollowUp[];
  /** party id → assigned salesperson id (null = unassigned). */
  assignee: Map<string, string | null>;
};

export async function loadFollowUps(db: TenantClient, now: Date = new Date()): Promise<StaffFollowUps> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = new Date(now.getTime() - ACTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [parties, invoices, actions] = await Promise.all([
    db.party.findMany({
      where: { isActive: true, totalOutstanding: { gt: 0 } },
      select: { id: true, name: true, city: true, phone: true, totalOutstanding: true, assignedToId: true },
      orderBy: { totalOutstanding: "desc" },
      take: PARTY_CAP,
    }),
    db.invoice.findMany({
      where: { status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] }, dueDate: { lt: startOfToday } },
      select: { partyId: true, dueDate: true },
    }),
    db.action.findMany({
      where: { performedAt: { gte: since } },
      select: { partyId: true, outcome: true, promiseDate: true, promiseAmount: true, performedAt: true },
      orderBy: { performedAt: "desc" },
    }),
  ]);

  const all = buildFollowUps(
    parties.map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      phone: p.phone,
      totalOutstanding: Number(p.totalOutstanding),
    })),
    invoices.map((i) => ({ partyId: i.partyId, dueDate: i.dueDate.toISOString() })),
    actions.map((a) => ({
      partyId: a.partyId,
      outcome: a.outcome,
      promiseDate: a.promiseDate?.toISOString() ?? null,
      promiseAmount: a.promiseAmount == null ? null : Number(a.promiseAmount),
      performedAt: a.performedAt.toISOString(),
    })),
    [],
    now,
  );

  const assignee = new Map(parties.map((p) => [p.id, p.assignedToId]));
  const byStaff = new Map<string, FollowUp[]>();
  const unassigned: FollowUp[] = [];
  for (const f of all) {
    const staffId = assignee.get(f.partyId) ?? null;
    if (!staffId) {
      unassigned.push(f);
      continue;
    }
    const list = byStaff.get(staffId) ?? [];
    list.push(f);
    byStaff.set(staffId, list);
  }
  return { byStaff, unassigned, assignee };
}
