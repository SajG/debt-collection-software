import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { PartyForm } from "../party-form";

export default async function NewPartyPage() {
  const profile = await requireProfile();

  const assignees =
    profile.role === "ADMIN"
      ? (
          await db.profile.findMany({
            select: { id: true, ownerName: true },
            orderBy: { ownerName: "asc" },
          })
        ).map((p) => ({ id: p.id, name: p.ownerName }))
      : undefined;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="Add party" subtitle="A customer you sell to on credit." />
      <PartyForm assignees={assignees} />
    </div>
  );
}
