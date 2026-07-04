import { subMonths } from "date-fns";
import type { Party } from "@prisma/client";
import { db } from "@/lib/db";
import { daysOverdue } from "./aging";
import { riskScore, type RiskInput, type RiskResult } from "./risk";
import { startOfToday } from "./balance";

/**
 * Assemble the pure-scoring inputs for one party from the DB.
 * hasOpenDispute mirrors the Phase D outreach pause driven by DISPUTED actions.
 */
export async function buildRiskInput(party: Party): Promise<RiskInput> {
  const today = startOfToday();
  const yearAgo = subMonths(today, 12);

  const [oldestOverdue, promises, recentPayments] = await Promise.all([
    db.invoice.findFirst({
      where: {
        partyId: party.id,
        status: { in: ["OVERDUE", "UNPAID", "PARTIAL"] },
        dueDate: { lt: today },
      },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true },
    }),
    db.action.findMany({
      where: {
        partyId: party.id,
        outcome: "PROMISE_TO_PAY",
        promiseDate: { lt: today, gte: yearAgo },
      },
      select: { promiseDate: true },
    }),
    db.payment.findMany({
      where: {
        partyId: party.id,
        paymentDate: { gte: yearAgo },
        invoiceId: { not: null },
      },
      select: { paymentDate: true, invoice: { select: { dueDate: true } } },
    }),
  ]);

  // A promise counts as broken when no payment arrived on/after its date.
  let brokenPromises = 0;
  for (const p of promises) {
    if (!p.promiseDate) continue;
    const kept = recentPayments.some((pay) => pay.paymentDate >= p.promiseDate!);
    if (!kept) brokenPromises++;
  }

  const late = recentPayments.filter(
    (p) => p.invoice && p.paymentDate > p.invoice.dueDate
  ).length;
  const latePaymentRatio =
    recentPayments.length > 0 ? late / recentPayments.length : 0;

  return {
    outstanding: Number(party.totalOutstanding),
    maxDaysOverdue: oldestOverdue ? Math.max(daysOverdue(oldestOverdue.dueDate), 0) : 0,
    creditLimit: party.creditLimit ? Number(party.creditLimit) : null,
    brokenPromises,
    latePaymentRatio,
    hasOpenDispute: party.outreachPaused ?? false,
  };
}

export async function scoreParty(party: Party): Promise<RiskResult> {
  return riskScore(await buildRiskInput(party));
}

/**
 * Score a party AND sync the stored riskLevel when it drifted, so the badge
 * shown from the column (party list, dashboard) always matches what any
 * live-scoring screen (worklist, party detail) just displayed.
 * Priority stays user-controlled — only riskLevel is written.
 */
export async function scoreAndPersistParty(party: Party): Promise<RiskResult> {
  const result = await scoreParty(party);
  if (result.level !== party.riskLevel) {
    await db.party.update({
      where: { id: party.id },
      data: { riskLevel: result.level },
    });
  }
  return result;
}

/**
 * Persist recomputed risk levels for all active parties.
 * Idempotent; called from the cron pass and safe to run on demand.
 */
export async function refreshRiskLevels(): Promise<number> {
  const parties = await db.party.findMany({ where: { isActive: true }, take: 2000 });
  let updated = 0;
  for (const party of parties) {
    const { level } = await scoreAndPersistParty(party);
    if (level !== party.riskLevel) updated++;
  }
  return updated;
}
