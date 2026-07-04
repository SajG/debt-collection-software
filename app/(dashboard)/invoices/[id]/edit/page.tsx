import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { PageHeader } from "../../../_components/ui";
import { InvoiceForm } from "../../invoice-form";

export default async function EditInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: { party: { select: { assignedToId: true, name: true } } },
  });
  if (!invoice || !canAccessParty(profile, invoice.party)) notFound();

  return (
    <div className="p-8">
      <PageHeader
        title={`Edit invoice ${invoice.invoiceNumber}`}
        subtitle={invoice.party.name}
      />
      <InvoiceForm
        invoiceId={invoice.id}
        initial={{
          partyId: invoice.partyId,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
          dueDate: invoice.dueDate.toISOString().slice(0, 10),
          totalAmount: invoice.totalAmount.toString(),
          notes: invoice.notes ?? "",
        }}
      />
    </div>
  );
}
