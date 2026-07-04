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

export default async function PartyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const party = await db.party.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: { select: { ownerName: true } },
      invoices: {
        orderBy: { dueDate: "asc" },
        take: 50,
      },
      payments: {
        orderBy: { paymentDate: "desc" },
        take: 20,
        include: { invoice: { select: { invoiceNumber: true } } },
      },
      actions: {
        orderBy: { performedAt: "desc" },
        take: 10,
        include: { performedBy: { select: { ownerName: true } } },
      },
    },
  });

  if (!party || !canAccessParty(profile, party)) notFound();

  const openInvoices = party.invoices.filter(
    (i) => i.status !== "PAID" && i.status !== "CANCELLED"
  );

  return (
    <div className="p-8">
      <PageHeader
        title={party.name}
        subtitle={[party.code, party.city, party.gstNumber]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/parties/${party.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            <LinkButton href={`/invoices/new?partyId=${party.id}`} variant="secondary">
              Add invoice
            </LinkButton>
            <LinkButton href={`/payments/new?partyId=${party.id}`} variant="secondary">
              Record payment
            </LinkButton>
            <LinkButton href={`/actions/new?partyId=${party.id}`}>
              Log follow-up
            </LinkButton>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Outstanding">
          <p className="text-2xl font-semibold">{formatINR(party.totalOutstanding)}</p>
        </Card>
        <Card title="Open invoices">
          <p className="text-2xl font-semibold">{openInvoices.length}</p>
        </Card>
        <Card title="Priority / Risk">
          <div className="flex gap-2 pt-1.5">
            <Badge tone={statusTone(party.priority)}>{party.priority}</Badge>
            <Badge tone={statusTone(party.riskLevel)}>{party.riskLevel}</Badge>
          </div>
        </Card>
        <Card title="Contact">
          <p className="text-sm">{party.contactPerson ?? "—"}</p>
          <p className="text-sm text-muted-foreground">
            {party.phone ?? party.email ?? "No contact info"}
          </p>
        </Card>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Invoices</h2>
          <Table>
            <thead>
              <tr>
                <Th>Invoice #</Th>
                <Th>Invoice date</Th>
                <Th>Due date</Th>
                <Th align="right">Total</Th>
                <Th align="right">Paid</Th>
                <Th align="right">Pending</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {party.invoices.length === 0 ? (
                <EmptyRow colSpan={7} message="No invoices for this party yet." />
              ) : (
                party.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30">
                    <Td>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </Td>
                    <Td>{formatDate(inv.invoiceDate)}</Td>
                    <Td>{formatDate(inv.dueDate)}</Td>
                    <Td align="right">{formatINR(inv.totalAmount)}</Td>
                    <Td align="right">{formatINR(inv.paidAmount)}</Td>
                    <Td align="right">
                      <span className="font-semibold">
                        {formatINR(inv.totalAmount.minus(inv.paidAmount))}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Recent payments
          </h2>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th align="right">Amount</Th>
                <Th>Method</Th>
                <Th>Against invoice</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {party.payments.length === 0 ? (
                <EmptyRow colSpan={5} message="No payments recorded yet." />
              ) : (
                party.payments.map((pay) => (
                  <tr key={pay.id}>
                    <Td>{formatDate(pay.paymentDate)}</Td>
                    <Td align="right">
                      <span className="font-semibold">{formatINR(pay.amount)}</span>
                    </Td>
                    <Td>{pay.method}</Td>
                    <Td>{pay.invoice?.invoiceNumber ?? "On account"}</Td>
                    <Td>
                      <span className="text-muted-foreground">
                        {pay.reference ?? "—"}
                      </span>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Recent follow-ups
          </h2>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Outcome</Th>
                <Th>Notes</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {party.actions.length === 0 ? (
                <EmptyRow colSpan={5} message="No follow-ups logged yet." />
              ) : (
                party.actions.map((a) => (
                  <tr key={a.id}>
                    <Td>{formatDate(a.performedAt)}</Td>
                    <Td>{a.type}</Td>
                    <Td>
                      {a.outcome ? (
                        <Badge tone={statusTone(a.outcome)}>{a.outcome}</Badge>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted-foreground">
                        {a.notes ?? "—"}
                        {a.promiseDate &&
                          ` (promised ${formatDate(a.promiseDate)}${
                            a.promiseAmount ? `, ${formatINR(a.promiseAmount)}` : ""
                          })`}
                      </span>
                    </Td>
                    <Td>{a.performedBy.ownerName}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </section>
      </div>
    </div>
  );
}
