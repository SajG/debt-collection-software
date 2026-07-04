import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import {
  PageHeader,
  Table,
  Th,
  Td,
  Badge,
  EmptyRow,
  statusTone,
} from "../_components/ui";

export default async function ProformasPage() {
  const profile = await requireProfile();

  const proformas = await db.proformaInvoice.findMany({
    where: { party: partyScopeWhere(profile) },
    include: { party: { select: { id: true, name: true } } },
    orderBy: { issueDate: "desc" },
    take: 100,
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Proforma invoices"
        subtitle="Creating and converting proformas is coming in a later release."
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
                  <span className="font-medium">{p.proformaNumber}</span>
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
    </div>
  );
}
