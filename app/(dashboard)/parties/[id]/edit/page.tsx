import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { PageHeader } from "../../../_components/ui";
import { PartyForm, type PartyFormValues } from "../../party-form";

export default async function EditPartyPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const party = await db.party.findUnique({ where: { id: params.id } });
  if (!party || !canAccessParty(profile, party)) notFound();

  const assignees =
    profile.role === "ADMIN"
      ? (
          await db.profile.findMany({
            select: { id: true, ownerName: true },
            orderBy: { ownerName: "asc" },
          })
        ).map((p) => ({ id: p.id, name: p.ownerName }))
      : undefined;

  const initial: Partial<PartyFormValues> = {
    name: party.name,
    code: party.code ?? "",
    gstNumber: party.gstNumber ?? "",
    phone: party.phone ?? "",
    email: party.email ?? "",
    contactPerson: party.contactPerson ?? "",
    address: party.address ?? "",
    city: party.city ?? "",
    state: party.state ?? "",
    creditLimit: party.creditLimit?.toString() ?? "",
    creditDays: party.creditDays?.toString() ?? "",
    priority: party.priority,
    assignedToId: party.assignedToId ?? "",
    isActive: party.isActive,
  };

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title={`Edit ${party.name}`} />
      <PartyForm partyId={party.id} initial={initial} assignees={assignees} />
    </div>
  );
}
