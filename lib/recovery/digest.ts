import { formatINR, formatDate } from "../format";
import type { DailyPlan, PlanParty, PlanReason } from "./plan";

function reasonLabel(r: PlanReason): string {
  switch (r.kind) {
    case "promise_due":
      return r.promiseAmount
        ? `promised ${formatINR(r.promiseAmount)} by ${formatDate(r.promiseDate)}`
        : `promise due ${formatDate(r.promiseDate)}`;
    case "bucket_slip":
      return `inv ${r.invoiceRef} slips to ${r.nextBucket} in ${r.daysToSlip}d`;
    case "stale_high_risk":
      return `high risk, no contact for ${r.daysSinceLastAction}d`;
    case "top_score":
      return "top outstanding";
  }
}

const MAX_LINES = 10;

export function renderStaffDigest(
  staffName: string,
  entries: PlanParty[],
  date: Date
): string {
  const header = `PayTrack — ${formatDate(date)}\n${staffName}, today's follow-ups:`;
  if (entries.length === 0) {
    return `${header}\nNo follow-ups due today. All clear.`;
  }
  const lines = entries
    .slice(0, MAX_LINES)
    .map(
      (e, i) =>
        `${i + 1}. ${e.partyName} — ${formatINR(e.outstanding)} (${reasonLabel(e.reasons[0])})`
    );
  const more = entries.length > MAX_LINES ? `\n…and ${entries.length - MAX_LINES} more in the app.` : "";
  return `${header}\n${lines.join("\n")}${more}`;
}

export function renderAdminDigest(
  plan: DailyPlan,
  staffNames: Map<string, string>,
  date: Date
): string {
  const rows: string[] = [];
  let total = 0;
  for (const [staffId, entries] of Array.from(plan.byStaff.entries())) {
    rows.push(`${staffNames.get(staffId) ?? staffId}: ${entries.length}`);
    total += entries.length;
  }
  if (plan.unassigned.length > 0) {
    rows.push(`Unassigned: ${plan.unassigned.length}`);
    total += plan.unassigned.length;
  }
  const top = [...plan.unassigned, ...Array.from(plan.byStaff.values()).flat()]
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 3)
    .map((e) => `• ${e.partyName} ${formatINR(e.outstanding)}`);
  return [
    `PayTrack recovery digest — ${formatDate(date)}`,
    `${total} follow-ups today.`,
    ...rows,
    top.length ? `Biggest exposure:\n${top.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
