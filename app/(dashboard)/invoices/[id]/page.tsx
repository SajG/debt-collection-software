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
import { invoicePending } from "@/lib/ar/balance";
import { InvoicePdfActions } from "./invoice-pdf-actions";
import {
  IssueCreditNoteForm,
  CancelCreditNoteButton,
} from "./credit-note-controls";

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
      creditNotes: {
        orderBy: { issuedAt: "desc" },
        include: { issuedBy: { select: { ownerName: true } } },
      },
    },
  });
  if (!invoice || !canAccessParty(profile, invoice.party)) notFound();

  const pending = invoicePending(invoice);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle={invoice.party.name}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/invoices/${invoice.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            {invoice.status !== "CANCELLED" && (
              <LinkButton
                href={`/invoices/new?from=${invoice.id}`}
                variant="secondary"
              >
                Duplicate for next month
              </LinkButton>
            )}
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

      <div className="mb-6">
        <InvoicePdfActions invoiceId={invoice.id} />
      </div>

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
          {invoice.creditedAmount.greaterThan(0) && (
            <p className="mt-1 text-xs text-muted-foreground">
              + {formatINR(invoice.creditedAmount)} credited
            </p>
          )}
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

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Credit notes</h2>
          {pending.greaterThan(0) && invoice.status !== "CANCELLED" && (
            <IssueCreditNoteForm
              invoiceId={invoice.id}
              pending={pending.toFixed(2)}
            />
          )}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Date</Th>
              <Th align="right">Amount</Th>
              <Th>Reason</Th>
              <Th>Issued by</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {invoice.creditNotes.length === 0 ? (
              <EmptyRow colSpan={6} message="No credit notes on this invoice." />
            ) : (
              invoice.creditNotes.map((cn) => (
                <tr key={cn.id}>
                  <Td>
                    <span className="font-medium">{cn.creditNoteNumber}</span>
                  </Td>
                  <Td>{formatDate(cn.issuedAt)}</Td>
                  <Td align="right">
                    <span className="font-semibold">{formatINR(cn.amount)}</span>
                  </Td>
                  <Td>
                    <span className="text-muted-foreground">{cn.reason}</span>
                  </Td>
                  <Td>{cn.issuedBy.ownerName}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Badge tone={cn.status === "ISSUED" ? "success" : "neutral"}>
                        {cn.status}
                      </Badge>
                      {cn.status === "ISSUED" && profile.role === "ADMIN" && (
                        <CancelCreditNoteButton creditNoteId={cn.id} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>

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
