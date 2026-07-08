import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import { PAGE_SIZES, parsePageParams, pageArgs, pageResult } from "@/lib/pagination";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  EmptyRow,
  Pagination,
} from "../_components/ui";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { cursor?: string; size?: string };
}) {
  const profile = await requireProfile();
  const page = parsePageParams(searchParams);

  const fetched = await db.payment.findMany({
    where: { party: partyScopeWhere(profile) },
    select: {
      id: true,
      paymentDate: true,
      amount: true,
      method: true,
      reference: true,
      party: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
      recordedBy: { select: { ownerName: true } },
    },
    orderBy: [{ paymentDate: "desc" }, { id: "asc" }],
    ...pageArgs(page),
  });
  const { rows: payments, hasNext, nextCursor } = pageResult(fetched, page);

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
            <Th />
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <EmptyRow colSpan={8} message="No payments recorded yet." />
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
                <Td>
                  <Link
                    href={`/payments/${p.id}/edit`}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </Link>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Pagination
        pathname="/payments"
        params={{ size: searchParams.size }}
        pageSize={page.size}
        pageSizes={PAGE_SIZES}
        hasNext={hasNext}
        nextCursor={nextCursor}
        onFirstPage={!page.cursor}
      />
    </div>
  );
}
