import type { RiskResult } from "../ar/risk";
import { formatINR } from "../format";
import type { RecommendationContent } from "./schema";

export type FallbackContext = {
  partyName: string;
  outstanding: number;
  maxDaysOverdue: number;
};

export function rulesFallback(
  risk: Pick<RiskResult, "score" | "level" | "reasons">,
  ctx: FallbackContext
): RecommendationContent {
  const urgency =
    risk.level === "CRITICAL" ? "today" : risk.level === "HIGH" ? "this_week" : "this_month";
  const nextAction =
    risk.level === "CRITICAL"
      ? `Visit or call the owner today — ${formatINR(ctx.outstanding)} stuck ${ctx.maxDaysOverdue} days`
      : risk.level === "HIGH"
        ? "Call this week and push for a dated payment commitment"
        : "Send a polite payment reminder with the outstanding statement";
  return {
    nextAction,
    urgency,
    talkingPoints: risk.reasons.length > 0 ? risk.reasons.slice(0, 5) : ["Routine follow-up"],
    draftMessage: `Namaste ${ctx.partyName}, aapke account par ${formatINR(ctx.outstanding)} outstanding hai. Kripya payment jaldi arrange karein. – PayTrack`,
  };
}
