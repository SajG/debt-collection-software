import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere, canAccessParty } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { InvoiceForm } from "../invoice-form";

/** +1 calendar month, clamped to the target month's last day (Jan 31 → Feb 28). */
function addOneMonth(d: Date): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + 1);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

const toInputDate = (d: Date) => d.toISOString().slice(0, 10);

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: { partyId?: string; from?: string };
}) {
  const profile = await requireProfile();

  const parties = await db.party.findMany({
    where: { ...partyScopeWhere(profile), isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Recurring-invoice shortcut: ?from=<invoiceId> prefills everything from an
  // existing invoice with dates shifted one month forward. The user confirms
  // the new invoice number — numbering stays in their hands.
  let prefill: Parameters<typeof InvoiceForm>[0]["initial"];
  let fromNumber: string | undefined;
  if (searchParams.from) {
    const source = await db.invoice.findUnique({
      where: { id: searchParams.from },
      include: { party: { select: { assignedToId: true } } },
    });
    if (source && canAccessParty(profile, source.party)) {
      fromNumber = source.invoiceNumber;
      prefill = {
        partyId: source.partyId,
        invoiceDate: toInputDate(addOneMonth(source.invoiceDate)),
        dueDate: toInputDate(addOneMonth(source.dueDate)),
        totalAmount: source.totalAmount.toString(),
        notes: source.notes ?? "",
      };
    }
  }
  if (!prefill && searchParams.partyId) {
    prefill = { partyId: searchParams.partyId };
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Add invoice"
        subtitle={
          fromNumber
            ? `Prefilled from ${fromNumber} with dates moved one month forward — enter the new invoice number.`
            : undefined
        }
      />
      <InvoiceForm parties={parties} initial={prefill} />
    </div>
  );
}
