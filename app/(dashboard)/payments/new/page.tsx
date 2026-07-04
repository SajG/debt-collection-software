import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere, canAccessParty } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { PaymentForm, type OpenInvoiceOption } from "../payment-form";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: { partyId?: string; invoiceId?: string };
}) {
  const profile = await requireProfile();

  const parties = await db.party.findMany({
    where: partyScopeWhere(profile),
    select: { id: true, name: true, assignedToId: true },
    orderBy: { name: "asc" },
  });

  let partyId: string | undefined;
  let openInvoices: OpenInvoiceOption[] | undefined;

  if (searchParams.partyId) {
    const party = parties.find((p) => p.id === searchParams.partyId);
    if (party && canAccessParty(profile, party)) {
      partyId = party.id;
      const invoices = await db.invoice.findMany({
        where: {
          partyId: party.id,
          status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        },
        orderBy: { dueDate: "asc" },
      });
      openInvoices = invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        pending: inv.totalAmount.minus(inv.paidAmount).toString(),
      }));
    }
  }

  const invoiceId =
    partyId && openInvoices?.some((i) => i.id === searchParams.invoiceId)
      ? searchParams.invoiceId
      : undefined;

  return (
    <div className="p-8">
      <PageHeader title="Record payment" />
      <PaymentForm
        parties={parties.map(({ id, name }) => ({ id, name }))}
        partyId={partyId}
        openInvoices={openInvoices}
        invoiceId={invoiceId}
      />
    </div>
  );
}
