import type { EscalationStage } from "@prisma/client";

export type EscalationRuleInput = {
  outstanding: number;
  maxDaysOverdue: number;
  brokenPromises: number;
};

export type EscalationVerdict = { flag: false } | { flag: true; reason: string };

const MIN_OVERDUE_DAYS = 60;
const MIN_OUTSTANDING = 50_000;
const MIN_BROKEN_PROMISES = 2;

export function shouldAutoFlag(input: EscalationRuleInput): EscalationVerdict {
  if (input.brokenPromises >= MIN_BROKEN_PROMISES) {
    return {
      flag: true,
      reason: `${input.brokenPromises} broken promises to pay`,
    };
  }
  if (input.maxDaysOverdue >= MIN_OVERDUE_DAYS && input.outstanding >= MIN_OUTSTANDING) {
    return {
      flag: true,
      reason: `₹${Math.round(input.outstanding).toLocaleString("en-IN")} outstanding, oldest invoice ${input.maxDaysOverdue} days overdue`,
    };
  }
  return { flag: false };
}

const LADDER: EscalationStage[] = ["FLAGGED", "NOTICE", "FINAL_NOTICE", "LEGAL"];

export function nextStage(stage: EscalationStage): EscalationStage | null {
  const i = LADDER.indexOf(stage);
  return i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1] : null;
}
