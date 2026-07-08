import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { PageHeader } from "../../../_components/ui";
import { ProformaForm } from "../../proforma-form";

export default async function EditProformaPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const proforma = await db.proformaInvoice.findUnique({
    where: { id: params.id },
    include: {
      party: { select: { assignedToId: true, name: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!proforma || !canAccessParty(profile, proforma.party)) notFound();
  if (proforma.status !== "DRAFT") redirect(`/proformas/${proforma.id}`);

  return (
    <div className="p-8">
      <PageHeader
        title={`Edit ${proforma.proformaNumber}`}
        subtitle={proforma.party.name}
      />
      <ProformaForm
        proformaId={proforma.id}
        initial={{
          partyId: proforma.partyId,
          issueDate: proforma.issueDate.toISOString().slice(0, 10),
          validUntil: proforma.validUntil?.toISOString().slice(0, 10) ?? "",
          notes: proforma.notes ?? "",
          termsConditions: proforma.termsConditions ?? "",
          lineItems: proforma.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity.toString(),
            unit: li.unit ?? "",
            unitPrice: li.unitPrice.toString(),
            taxRate: li.taxRate.toString(),
          })),
        }}
      />
    </div>
  );
}
