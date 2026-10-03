import Link from "next/link";
import { requireProfile } from "@/lib/authz";
import { partyScopeWhere } from "@/lib/authz-scope";
import { tenantDb } from "@/lib/tenant";
import { formatINR, formatDate } from "@/lib/format";
import { PageHeader } from "../_components/ui";
import { EscalationControls } from "./escalation-controls";

export const dynamic = "force-dynamic";

const STAGE_ORDER = ["LEGAL", "FINAL_NOTICE", "NOTICE", "FLAGGED"] as const;
const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  FLAGGED: "Flagged",
  NOTICE: "Notice sent",
  FINAL_NOTICE: "Final notice",
  LEGAL: "Legal",
};

export default async function EscalationsPage() {
  const profile = await requireProfile();
  const db = tenantDb(profile.organizationId);
  const escalations = await db.escalation.findMany({
    where: { status: "OPEN", party: partyScopeWhere(profile) },
    include: {
      party: { select: { id: true, name: true, totalOutstanding: true } },
      events: { orderBy: { createdAt: "desc" }, take: 3, include: { by: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Escalations" />
      {escalations.length === 0 && (
        <p className="text-neutral-500">No open escalations.</p>
      )}
      {STAGE_ORDER.map((stage) => {
        const group = escalations.filter((e) => e.stage === stage);
        if (group.length === 0) return null;
        return (
          <section key={stage} className="space-y-2">
            <h2 className="text-lg font-semibold">{STAGE_LABEL[stage]}</h2>
            <ul className="divide-y rounded-md border">
              {group.map((e) => (
                <li key={e.id} className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <Link href={`/parties/${e.party.id}`} className="font-medium hover:underline">
                      {e.party.name}
                    </Link>
                    <span>{formatINR(Number(e.party.totalOutstanding))}</span>
                  </div>
                  <p className="text-sm text-neutral-500">{e.reason}</p>
                  <ul className="text-xs text-neutral-500">
                    {e.events.map((ev) => (
                      <li key={ev.id}>
                        {formatDate(ev.createdAt)} — {ev.note}
                        {ev.by ? ` (${ev.by.ownerName})` : " (system)"}
                      </li>
                    ))}
                  </ul>
                  <EscalationControls
                    escalationId={e.id}
                    stage={e.stage}
                    isAdmin={profile.role === "ADMIN"}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
