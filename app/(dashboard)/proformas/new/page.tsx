import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { ProformaForm } from "../proforma-form";

export default async function NewProformaPage({
  searchParams,
}: {
  searchParams: { partyId?: string };
}) {
  const profile = await requireProfile();

  const parties = await db.party.findMany({
    where: { ...partyScopeWhere(profile), isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-8">
      <PageHeader title="New proforma invoice" />
      <ProformaForm
        parties={parties}
        initial={searchParams.partyId ? { partyId: searchParams.partyId } : undefined}
      />
    </div>
  );
}
