import { subMonths } from "date-fns";
import type { TenantClient } from "@/lib/tenant";
import { buildRiskInput } from "@/lib/ar/refresh";
import { riskScore } from "@/lib/ar/risk";
import { daysOverdue } from "@/lib/ar/aging";
import { generatePartyRecommendation, CLAUDE_MODEL, type PartyAiContext } from "@/lib/ai/claude";
import { rulesFallback } from "@/lib/ai/fallback";

const HISTORY_MONTHS = 6;
const HISTORY_LIMIT = 10;

export async function refreshRecommendation(
  db: TenantClient,
  partyId: string,
): Promise<void> {
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return;

  const since = subMonths(new Date(), HISTORY_MONTHS);
  const [riskInput, invoices, payments, actions] = await Promise.all([
    buildRiskInput(db, party),
    db.invoice.findMany({
      where: { partyId, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
      orderBy: { dueDate: "asc" },
      take: HISTORY_LIMIT,
      select: { invoiceNumber: true, totalAmount: true, paidAmount: true, dueDate: true },
    }),
    db.payment.findMany({
      where: { partyId, paymentDate: { gte: since } },
      orderBy: { paymentDate: "desc" },
      take: HISTORY_LIMIT,
      select: { paymentDate: true, amount: true, method: true },
    }),
    db.action.findMany({
      where: { partyId, performedAt: { gte: since } },
      orderBy: { performedAt: "desc" },
      take: HISTORY_LIMIT,
      select: { performedAt: true, type: true, outcome: true, notes: true },
    }),
  ]);

  const risk = riskScore(riskInput);
  const context: PartyAiContext = {
    name: party.name,
    outstanding: riskInput.outstanding,
    maxDaysOverdue: riskInput.maxDaysOverdue,
    brokenPromises: riskInput.brokenPromises,
    riskLevel: risk.level,
    creditDays: party.creditDays,
    openInvoices: invoices.map((i) => ({
      number: i.invoiceNumber,
      pending: Number(i.totalAmount) - Number(i.paidAmount),
      daysOverdue: Math.max(daysOverdue(i.dueDate), 0),
    })),
    recentPayments: payments.map((p) => ({
      date: p.paymentDate.toISOString().slice(0, 10),
      amount: Number(p.amount),
      method: p.method,
    })),
    recentActions: actions.map((a) => ({
      date: a.performedAt.toISOString().slice(0, 10),
      type: a.type,
      outcome: a.outcome,
      notes: a.notes,
    })),
  };

  const aiContent = await generatePartyRecommendation(context);
  const content =
    aiContent ??
    rulesFallback(risk, {
      partyName: party.name,
      outstanding: riskInput.outstanding,
      maxDaysOverdue: riskInput.maxDaysOverdue,
    });

  await db.recommendation.upsert({
    where: { partyId },
    create: {
      partyId,
      content,
      model: aiContent ? CLAUDE_MODEL : "rules-fallback",
    },
    update: {
      content,
      model: aiContent ? CLAUDE_MODEL : "rules-fallback",
      generatedAt: new Date(),
    },
  });
}
