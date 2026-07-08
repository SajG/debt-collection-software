import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { PageHeader } from "../../../_components/ui";
import { ActionForm } from "../../action-form";

export default async function EditActionPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const action = await db.action.findUnique({
    where: { id: params.id },
    include: { party: { select: { assignedToId: true, name: true } } },
  });
  if (!action || !canAccessParty(profile, action.party)) notFound();

  return (
    <div className="p-4 sm:p-8">
      <PageHeader title="Edit follow-up" subtitle={action.party.name} />
      <ActionForm
        actionId={action.id}
        initial={{
          partyId: action.partyId,
          type: action.type,
          outcome: action.outcome ?? "",
          notes: action.notes ?? "",
          contactedPerson: action.contactedPerson ?? "",
          promiseDate: action.promiseDate?.toISOString().slice(0, 10) ?? "",
          promiseAmount: action.promiseAmount?.toString() ?? "",
          nextFollowUpDate: action.nextFollowUpDate?.toISOString().slice(0, 10) ?? "",
        }}
      />
    </div>
  );
}
