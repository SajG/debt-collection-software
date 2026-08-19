import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { formatINR } from "@/lib/format";
import { PageHeader, Card } from "../../_components/ui";
import { AssignPartiesForm } from "./assign-form";

export const dynamic = "force-dynamic";

// Unassigned party pool. Salespeople can't see these rows anymore (RLS
// + partyScopeWhere both require assignedToId = auth.uid()), so the
// bulk-assign flow here is how a customer becomes visible to anyone
// on the sales side while Tally sync is deferred.
export default async function UnassignedPartiesPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const [parties, assignees] = await Promise.all([
    db.party.findMany({
      where: { assignedToId: null, isActive: true },
      select: {
        id: true,
        name: true,
        city: true,
        totalOutstanding: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    db.profile.findMany({
      where: { isActive: true, role: { in: ["STAFF", "ADMIN"] } },
      select: { id: true, ownerName: true, role: true },
      orderBy: [{ role: "asc" }, { ownerName: "asc" }],
    }),
  ]);

  const rows = parties.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    totalOutstanding: formatINR(Number(p.totalOutstanding)),
  }));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Unassigned customers"
        subtitle={`${parties.length} customer${parties.length === 1 ? "" : "s"} with no salesperson. Nobody on the sales side sees these until you assign them.`}
      />

      <Card title="Assign in bulk">
        <AssignPartiesForm parties={rows} assignees={assignees} />
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        This screen only writes assignedToId — nothing else about the
        customer or their ledger changes. Reassignment (already-owned
        customers) belongs on the individual customer page, not here.
      </p>
    </div>
  );
}
