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
  Badge,
  EmptyRow,
  Pagination,
  statusTone,
} from "../_components/ui";

export default async function ProformasPage({
  searchParams,
}: {
  searchParams: { cursor?: string; size?: string };
}) {
  const profile = await requireProfile();
  const page = parsePageParams(searchParams);

  const fetched = await db.proformaInvoice.findMany({
    where: { party: partyScopeWhere(profile) },
    select: {
      id: true,
      proformaNumber: true,
      issueDate: true,
      totalAmount: true,
      status: true,
      party: { select: { id: true, name: true } },
    },
    orderBy: [{ issueDate: "desc" }, { id: "asc" }],
    ...pageArgs(page),
  });
  const { rows: proformas, hasNext, nextCursor } = pageResult(fetched, page);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Proforma invoices"
        subtitle="Draft, send, confirm, and convert proformas into invoices."
        action={<LinkButton href="/proformas/new">New proforma</LinkButton>}
      />

      <Table>
        <thead>
          <tr>
            <Th>Number</Th>
            <Th>Party</Th>
            <Th>Issued</Th>
            <Th align="right">Total</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {proformas.length === 0 ? (
            <EmptyRow colSpan={5} message="No proforma invoices yet." />
          ) : (
            proformas.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link
                    href={`/proformas/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.proformaNumber}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/parties/${p.party.id}`} className="hover:underline">
                    {p.party.name}
                  </Link>
                </Td>
                <Td>{formatDate(p.issueDate)}</Td>
                <Td align="right">{formatINR(p.totalAmount)}</Td>
                <Td>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Pagination
        pathname="/proformas"
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
