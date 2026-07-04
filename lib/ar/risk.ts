// Pure, explainable risk scoring — no DB access, no black box, unit-tested.
// Score 0–100 from three visible components; every point is attributable
// to a human-readable reason.

import type { RiskLevel } from "@prisma/client";

export type RiskInput = {
  /** Current outstanding balance in ₹. */
  outstanding: number;
  /** Days overdue of the oldest unpaid invoice (0 if nothing overdue). */
  maxDaysOverdue: number;
  /** Agreed credit limit in ₹, if any. */
  creditLimit: number | null;
  /** Promises to pay whose promised date passed with no payment after it. */
  brokenPromises: number;
  /** Of the last 12 months' invoice-linked payments, fraction paid late (0–1). */
  latePaymentRatio: number;
  /** Open dispute recorded and not yet cleared. */
  hasOpenDispute: boolean;
};

export type RiskResult = {
  score: number; // 0–100
  level: RiskLevel;
  reasons: string[];
};

// Component weights — sum to 100.
const W_OVERDUE = 45; // how long money has been stuck
const W_EXPOSURE = 30; // how much money is at stake
const W_BEHAVIOUR = 25; // promises broken + habitual late payment

export function riskScore(input: RiskInput): RiskResult {
  const reasons: string[] = [];

  if (input.outstanding <= 0) {
    return { score: 0, level: "LOW", reasons: ["No outstanding balance"] };
  }

  // 1. Overdue age: linear up to 120 days.
  const overdueFactor = Math.min(Math.max(input.maxDaysOverdue, 0), 120) / 120;
  const overduePts = overdueFactor * W_OVERDUE;
  if (input.maxDaysOverdue > 0) {
    reasons.push(`Oldest unpaid invoice is ${input.maxDaysOverdue} days overdue`);
  }

  // 2. Exposure: relative to credit limit when set (2× limit = max),
  //    otherwise absolute scale maxing at ₹10,00,000.
  let exposureFactor: number;
  if (input.creditLimit && input.creditLimit > 0) {
    exposureFactor = Math.min(input.outstanding / (2 * input.creditLimit), 1);
    if (input.outstanding > input.creditLimit) {
      reasons.push("Outstanding exceeds the agreed credit limit");
    }
  } else {
    exposureFactor = Math.min(input.outstanding / 1_000_000, 1);
  }
  const exposurePts = exposureFactor * W_EXPOSURE;

  // 3. Behaviour: broken promises (10 pts each, cap 15) + late-payment habit.
  const promisePts = Math.min(input.brokenPromises * 10, 15);
  if (input.brokenPromises > 0) {
    reasons.push(
      `${input.brokenPromises} payment promise${input.brokenPromises > 1 ? "s" : ""} not kept`
    );
  }
  const latePts = Math.min(Math.max(input.latePaymentRatio, 0), 1) * 10;
  if (input.latePaymentRatio >= 0.5) {
    reasons.push("Usually pays after the due date");
  }
  const behaviourPts = Math.min(promisePts + latePts, W_BEHAVIOUR);

  let score = Math.round(overduePts + exposurePts + behaviourPts);

  // An open dispute freezes outreach (Phase D) and floors the risk at MEDIUM.
  if (input.hasOpenDispute) {
    reasons.push("Open dispute awaiting resolution");
    score = Math.max(score, 30);
  }

  score = Math.min(score, 100);
  return { score, level: levelForScore(score), reasons };
}

export function levelForScore(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 45) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}
