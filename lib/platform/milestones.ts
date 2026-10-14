import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { capture, type ProductEvent } from "@/lib/analytics-events/posthog";

// SY38 — "has this company ever…?" Each answer is stored once in
// OrgLifecycleEvent (key "milestone:<name>") and the matching PostHog
// event is sent at the moment the row is first written — so
// first_order_placed fires exactly once per company no matter whether
// the order came from the web, the phone or a retry.
//
// Milestones are worked out from the data (is there an order? a paired
// Tally connector?), not from who called what, so a missed call site
// cannot lose one: the daily lifecycle cron runs syncMilestones for
// every company and catches up. The same rows are the "activation
// events" that decide which lifecycle emails to skip.
//
// Platform module: reads across one company by explicit
// organizationId; raw db is allowed here (see .eslintrc.json).

export const MILESTONES = [
  "company_created",
  "tally_connected",
  "data_imported",
  "team_invited",
  "first_order_placed",
  "first_payment_recorded",
] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Milestones that are also PostHog events. */
const EVENT_FOR: Partial<Record<Milestone, ProductEvent>> = {
  tally_connected: "tally_connected",
  first_order_placed: "first_order_placed",
  first_payment_recorded: "first_payment_recorded",
};

/** Insert (company, key) if absent. True only for the call that wrote it. */
export async function recordOnce(
  organizationId: string,
  key: string,
  detail?: Prisma.InputJsonValue,
): Promise<boolean> {
  try {
    await db.orgLifecycleEvent.create({ data: { organizationId, key, detail } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export async function reachedMilestones(organizationId: string): Promise<Set<Milestone>> {
  const rows = await db.orgLifecycleEvent.findMany({
    where: { organizationId, key: { startsWith: "milestone:" } },
    select: { key: true },
  });
  return new Set(rows.map((r) => r.key.slice("milestone:".length) as Milestone));
}

/** What the data says this company has done so far. */
export async function currentFacts(organizationId: string): Promise<Record<Milestone, boolean>> {
  const [connector, tallyImport, anyImport, members, order, payment] = await Promise.all([
    db.tallyConnector.findFirst({ where: { organizationId }, select: { id: true } }),
    db.party.findFirst({ where: { organizationId, tallyRef: { not: null } }, select: { id: true } }),
    db.syncLog.findFirst({
      where: { organizationId, status: "COMPLETED", syncType: { in: ["IMPORT_PARTIES", "IMPORT_INVOICES", "FULL_IMPORT"] } },
      select: { id: true },
    }),
    db.membership.count({ where: { organizationId, isActive: true } }),
    db.salesOrder.findFirst({ where: { organizationId }, select: { id: true } }),
    db.payment.findFirst({ where: { organizationId, source: "MANUAL" }, select: { id: true } }),
  ]);
  return {
    company_created: true,
    tally_connected: Boolean(connector || tallyImport),
    data_imported: Boolean(anyImport || tallyImport),
    team_invited: members > 1,
    first_order_placed: Boolean(order),
    first_payment_recorded: Boolean(payment),
  };
}

/**
 * Record any milestone the company has newly reached and send its
 * PostHog event. Safe to call as often as you like. Returns the newly
 * recorded ones. `actorId` is the Profile id of whoever just acted, when
 * known; otherwise the company is the actor.
 */
export async function syncMilestones(
  organizationId: string,
  opts: { actorId?: string | null; source?: "web" | "mobile" | "cron" | "tally" } = {},
): Promise<Milestone[]> {
  const [facts, have] = await Promise.all([
    currentFacts(organizationId),
    reachedMilestones(organizationId),
  ]);
  const fresh: Milestone[] = [];
  for (const m of MILESTONES) {
    if (!facts[m] || have.has(m)) continue;
    if (!(await recordOnce(organizationId, `milestone:${m}`))) continue;
    fresh.push(m);
    const event = EVENT_FOR[m];
    if (event) {
      await capture({
        event,
        profileId: opts.actorId ?? null,
        organizationId,
        properties: { source: opts.source ?? "cron" },
      });
    }
  }
  return fresh;
}

/** Never lets analytics bookkeeping fail the action that triggered it. */
export async function syncMilestonesQuietly(
  organizationId: string,
  opts: Parameters<typeof syncMilestones>[1] = {},
): Promise<void> {
  try {
    await syncMilestones(organizationId, opts);
  } catch {
    /* the daily cron will catch up */
  }
}
