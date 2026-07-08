import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import { differenceInCalendarDays } from "date-fns";
import type { InvoiceStatus } from "@prisma/client";
import { PAGE_SIZES, parsePageParams, pageArgs, pageResult } from "@/lib/pagination";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyRow,
  Pagination,
  statusTone,
} from "../_components/ui";

const FILTERS: { key: string; label: string; statuses: InvoiceStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["UNPAID", "PARTIAL", "OVERDUE"] },
  { key: "overdue", label: "Overdue", statuses: ["OVERDUE"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
  {
    key: "all",
    label: "All",
    statuses: ["UNPAID", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"],
  },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { filter?: string; cursor?: string; size?: string };
}) {
  const profile = await requireProfile();
  const filter = FILTERS.find((f) => f.key === searchParams.filter) ?? FILTERS[0];
  const page = parsePageParams(searchParams);

  const fetched = await db.invoice.findMany({
    where: {
      status: { in: filter.statuses },
      party: partyScopeWhere(profile),
    },
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      creditedAmount: true,
      status: true,
      party: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    ...pageArgs(page),
  });
  const { rows: invoices, hasNext, nextCursor } = pageResult(fetched, page);

  const now = new Date();

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Invoices"
        subtitle="Outstanding and settled invoices across all parties."
        action={<LinkButton href="/invoices/new">Add invoice</LinkButton>}
      />

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/invoices?filter=${f.key}`}
            className={`rounded-full px-3 py-1 text-sm ${
              f.key === filter.key
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Invoice #</Th>
            <Th>Party</Th>
            <Th>Due date</Th>
            <Th align="right">Total</Th>
            <Th align="right">Pending</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 ? (
            <EmptyRow colSpan={6} message="No invoices in this view." />
          ) : (
            invoices.map((inv) => {
              const overdueDays = differenceInCalendarDays(now, inv.dueDate);
              return (
                <tr key={inv.id} className="hover:bg-muted/30">
                  <Td>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium hover:underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/parties/${inv.party.id}`}
                      className="hover:underline"
                    >
                      {inv.party.name}
                    </Link>
                  </Td>
                  <Td>
                    {formatDate(inv.dueDate)}
                    {inv.status === "OVERDUE" && overdueDays > 0 && (
                      <span className="ml-2 text-xs text-red-600">
                        {overdueDays}d overdue
                      </span>
                    )}
                  </Td>
                  <Td align="right">{formatINR(inv.totalAmount)}</Td>
                  <Td align="right">
                    <span className="font-semibold">
                      {formatINR(
                        inv.totalAmount
                          .minus(inv.paidAmount)
                          .minus(inv.creditedAmount)
                      )}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      <Pagination
        pathname="/invoices"
        params={{ filter: searchParams.filter, size: searchParams.size }}
        pageSize={page.size}
        pageSizes={PAGE_SIZES}
        hasNext={hasNext}
        nextCursor={nextCursor}
        onFirstPage={!page.cursor}
      />
    </div>
  );
}
