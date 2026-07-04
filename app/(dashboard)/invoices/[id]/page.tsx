import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import {
  PageHeader,
  LinkButton,
  Card,
  Table,
  Th,
  Td,
  Badge,
  EmptyRow,
  statusTone,
} from "../../_components/ui";

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: {
      party: true,
      payments: {
        orderBy: { paymentDate: "desc" },
        include: { recordedBy: { select: { ownerName: true } } },
      },
    },
  });
  if (!invoice || !canAccessParty(profile, invoice.party)) notFound();

  const pending = invoice.totalAmount.minus(invoice.paidAmount);

  return (
    <div className="p-8">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle={invoice.party.name}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/invoices/${invoice.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            {pending.greaterThan(0) && invoice.status !== "CANCELLED" && (
              <LinkButton
                href={`/payments/new?partyId=${invoice.partyId}&invoiceId=${invoice.id}`}
              >
                Record payment
              </LinkButton>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Status">
          <div className="pt-1.5">
            <Badge tone={statusTone(invoice.status)}>{invoice.status}</Badge>
          </div>
        </Card>
        <Card title="Total">
          <p className="text-2xl font-semibold">{formatINR(invoice.totalAmount)}</p>
        </Card>
        <Card title="Paid">
          <p className="text-2xl font-semibold">{formatINR(invoice.paidAmount)}</p>
        </Card>
        <Card title="Pending">
          <p className="text-2xl font-semibold">{formatINR(pending)}</p>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Invoice date">
          <p className="text-sm">{formatDate(invoice.invoiceDate)}</p>
        </Card>
        <Card title="Due date">
          <p className="text-sm">{formatDate(invoice.dueDate)}</p>
        </Card>
        <Card title="Party">
          <Link
            href={`/parties/${invoice.partyId}`}
            className="text-sm font-medium hover:underline"
          >
            {invoice.party.name}
          </Link>
        </Card>
      </div>

      {invoice.notes && (
        <div className="mb-6">
          <Card title="Notes">
            <p className="text-sm text-muted-foreground">{invoice.notes}</p>
          </Card>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Payments against this invoice
        </h2>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th align="right">Amount</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
              <Th>Recorded by</Th>
            </tr>
          </thead>
          <tbody>
            {invoice.payments.length === 0 ? (
              <EmptyRow colSpan={5} message="No payments against this invoice yet." />
            ) : (
              invoice.payments.map((p) => (
                <tr key={p.id}>
                  <Td>{formatDate(p.paymentDate)}</Td>
                  <Td align="right">
                    <span className="font-semibold">{formatINR(p.amount)}</span>
                  </Td>
                  <Td>{p.method}</Td>
                  <Td>
                    <span className="text-muted-foreground">
                      {p.reference ?? "—"}
                    </span>
                  </Td>
                  <Td>{p.recordedBy.ownerName}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
