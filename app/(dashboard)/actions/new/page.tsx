import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { ActionForm } from "../action-form";

export default async function NewActionPage({
  searchParams,
}: {
  searchParams: { partyId?: string };
}) {
  const profile = await requireProfile();

  const parties = await db.party.findMany({
    where: partyScopeWhere(profile),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Log follow-up"
        subtitle="Record a call, visit, or note about a payment conversation."
      />
      <ActionForm
        parties={parties}
        initial={searchParams.partyId ? { partyId: searchParams.partyId } : undefined}
      />
    </div>
  );
}
