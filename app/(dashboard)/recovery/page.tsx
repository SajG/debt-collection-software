import Link from "next/link";
import { requireProfile } from "@/lib/authz";
import { buildPlanForProfile } from "@/lib/recovery/run";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { PageHeader } from "../_components/ui";
import type { PlanParty, PlanReason } from "@/lib/recovery/plan";

export const dynamic = "force-dynamic";

function reasonText(r: PlanReason): string {
  switch (r.kind) {
    case "promise_due":
      return "Promise due";
    case "bucket_slip":
      return `Slipping to ${r.nextBucket} in ${r.daysToSlip}d`;
    case "stale_high_risk":
      return `No contact ${r.daysSinceLastAction}d`;
    case "top_score":
      return "Top outstanding";
  }
}

function ChaseList({ title, entries }: { title: string; entries: PlanParty[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="divide-y rounded-md border">
        {entries.map((e) => (
          <li key={e.partyId} className="flex items-center justify-between p-3">
            <div>
              <Link href={`/parties/${e.partyId}`} className="font-medium hover:underline">
                {e.partyName}
              </Link>
              <p className="text-sm text-neutral-500">{reasonText(e.reasons[0])}</p>
            </div>
            <span className="font-medium">{formatINR(e.outstanding)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function RecoveryPage() {
  const profile = await requireProfile();
  const plan = await buildPlanForProfile(profile);
  const profiles = profile.role === "ADMIN" ? await db.profile.findMany() : [profile];
  const names = new Map(profiles.map((p) => [p.id, p.ownerName]));

  const sections = Array.from(plan.byStaff.entries());
  const empty = sections.every(([, v]) => v.length === 0) && plan.unassigned.length === 0;

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Today's recovery plan" />
      {empty && <p className="text-neutral-500">No follow-ups due today. All clear.</p>}
      {sections.map(([staffId, entries]) => (
        <ChaseList key={staffId} title={names.get(staffId) ?? "Staff"} entries={entries} />
      ))}
      <ChaseList title="Unassigned" entries={plan.unassigned} />
    </div>
  );
}
