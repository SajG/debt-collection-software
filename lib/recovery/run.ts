import { subDays } from "date-fns";
import type { Profile } from "@prisma/client";
import { db } from "@/lib/db";
import { buildRiskInput } from "@/lib/ar/refresh";
import { riskScore } from "@/lib/ar/risk";
import { daysOverdue } from "@/lib/ar/aging";
import { shouldAutoFlag } from "./escalation";
import { buildDailyPlan, bucketSlip, type PlanParty, type DailyPlan } from "./plan";
import { refreshRecommendation } from "./recommend";

const ACTIVE_PARTY_WHERE = { isActive: true, totalOutstanding: { gt: 0 } } as const;
const STALE_ACTION_DAYS = 14;
const REC_REFRESH_COUNT = 15;
const CRON_PARTY_CAP = 500;

export async function runAutoFlag(): Promise<{ flagged: number; checked: number }> {
  const parties = await db.party.findMany({ where: ACTIVE_PARTY_WHERE, take: CRON_PARTY_CAP });
  let flagged = 0;
  for (const party of parties) {
    const input = await buildRiskInput(party);
    const verdict = shouldAutoFlag({
      outstanding: input.outstanding,
      maxDaysOverdue: input.maxDaysOverdue,
      brokenPromises: input.brokenPromises,
    });
    if (!verdict.flag) continue;
    const open = await db.escalation.findFirst({
      where: { partyId: party.id, status: "OPEN" },
      select: { id: true },
    });
    if (open) continue;
    await db.escalation.create({
      data: {
        partyId: party.id,
        reason: verdict.reason,
        events: { create: { toStage: "FLAGGED", note: `Auto-flagged: ${verdict.reason}` } },
      },
    });
    flagged++;
  }
  return { flagged, checked: parties.length };
}

export async function runRecommendationRefresh(): Promise<{ refreshed: number }> {
  const parties = await db.party.findMany({ where: ACTIVE_PARTY_WHERE, take: CRON_PARTY_CAP });
  const scored = await Promise.all(
    parties.map(async (p) => ({ id: p.id, score: riskScore(await buildRiskInput(p)).score }))
  );
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, REC_REFRESH_COUNT);
  for (const { id } of top) {
    await refreshRecommendation(id);
  }
  return { refreshed: top.length };
}

export async function assemblePlanParties(now: Date = new Date()): Promise<PlanParty[]> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const staleCutoff = subDays(today, STALE_ACTION_DAYS);

  const parties = await db.party.findMany({
    where: ACTIVE_PARTY_WHERE,
    take: CRON_PARTY_CAP,
    include: {
      invoices: {
        where: { status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
        select: { invoiceNumber: true, dueDate: true },
      },
      actions: {
        orderBy: { performedAt: "desc" },
        take: 1,
        select: { performedAt: true, promiseDate: true, promiseAmount: true, outcome: true },
      },
    },
  });

  const result: PlanParty[] = [];
  for (const party of parties) {
    const input = await buildRiskInput(party);
    const risk = riskScore(input);
    const reasons: PlanParty["reasons"] = [];

    const latest = party.actions[0];
    if (
      latest?.outcome === "PROMISE_TO_PAY" &&
      latest.promiseDate &&
      latest.promiseDate <= today
    ) {
      reasons.push({
        kind: "promise_due",
        promiseDate: latest.promiseDate,
        promiseAmount: latest.promiseAmount ? Number(latest.promiseAmount) : null,
      });
    }

    for (const inv of party.invoices) {
      const slip = bucketSlip(daysOverdue(inv.dueDate, now));
      if (slip) {
        reasons.push({ kind: "bucket_slip", invoiceRef: inv.invoiceNumber, ...slip });
        break;
      }
    }

    if (
      (risk.level === "HIGH" || risk.level === "CRITICAL") &&
      (!latest || latest.performedAt < staleCutoff)
    ) {
      const days = latest
        ? Math.round((today.getTime() - latest.performedAt.getTime()) / 86_400_000)
        : STALE_ACTION_DAYS;
      reasons.push({ kind: "stale_high_risk", daysSinceLastAction: days });
    }

    result.push({
      partyId: party.id,
      partyName: party.name,
      phone: party.phone,
      assignedToId: party.assignedToId,
      outstanding: input.outstanding,
      score: risk.score,
      reasons,
    });
  }
  return result;
}

export async function buildPlanForProfile(profile: Profile): Promise<DailyPlan> {
  const all = buildDailyPlan(await assemblePlanParties());
  if (profile.role === "ADMIN") return all;
  return {
    byStaff: new Map([[profile.id, all.byStaff.get(profile.id) ?? []]]),
    unassigned: all.unassigned,
  };
}
