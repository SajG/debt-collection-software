import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { formatINR } from "@/lib/format";
import { PageHeader } from "../../_components/ui";
import { AssignClient, type AssignableParty } from "./assign-client";

export default async function BulkAssignPage() {
  await requireAdmin();

  const [parties, staff] = await Promise.all([
    db.party.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        totalOutstanding: true,
        assignedTo: { select: { ownerName: true } },
      },
      orderBy: [{ totalOutstanding: "desc" }, { name: "asc" }],
      take: 500,
    }),
    db.profile.findMany({
      select: { id: true, ownerName: true, role: true },
      orderBy: { ownerName: "asc" },
    }),
  ]);

  const rows: AssignableParty[] = parties.map((p) => ({
    id: p.id,
    name: p.name,
    outstanding: formatINR(p.totalOutstanding),
    assignedToName: p.assignedTo?.ownerName ?? null,
  }));

  return (
    <div className="p-8">
      <PageHeader
        title="Assign parties"
        subtitle="Reassign multiple parties to a team member at once. Staff see their assigned parties plus unassigned ones."
      />
      <AssignClient
        parties={rows}
        staff={staff.map((s) => ({
          id: s.id,
          name: s.role === "ADMIN" ? `${s.ownerName} (admin)` : s.ownerName,
        }))}
      />
    </div>
  );
}
