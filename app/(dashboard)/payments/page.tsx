import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  EmptyRow,
} from "../_components/ui";

export default async function PaymentsPage() {
  const profile = await requireProfile();

  const payments = await db.payment.findMany({
    where: { party: partyScopeWhere(profile) },
    include: {
      party: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
      recordedBy: { select: { ownerName: true } },
    },
    orderBy: { paymentDate: "desc" },
    take: 200,
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Payments"
        subtitle="Payments received from your parties."
        action={<LinkButton href="/payments/new">Record payment</LinkButton>}
      />

      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Party</Th>
            <Th align="right">Amount</Th>
            <Th>Method</Th>
            <Th>Against invoice</Th>
            <Th>Reference</Th>
            <Th>Recorded by</Th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <EmptyRow colSpan={7} message="No payments recorded yet." />
          ) : (
            payments.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <Td>{formatDate(p.paymentDate)}</Td>
                <Td>
                  <Link href={`/parties/${p.party.id}`} className="hover:underline">
                    {p.party.name}
                  </Link>
                </Td>
                <Td align="right">
                  <span className="font-semibold">{formatINR(p.amount)}</span>
                </Td>
                <Td>{p.method}</Td>
                <Td>
                  {p.invoice ? (
                    <Link
                      href={`/invoices/${p.invoice.id}`}
                      className="hover:underline"
                    >
                      {p.invoice.invoiceNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">On account</span>
                  )}
                </Td>
                <Td>
                  <span className="text-muted-foreground">{p.reference ?? "—"}</span>
                </Td>
                <Td>{p.recordedBy.ownerName}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
