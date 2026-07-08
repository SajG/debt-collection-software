import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  Badge,
  statusTone,
} from "../../_components/ui";
import { ProformaDetailActions } from "./proforma-detail-actions";

export default async function ProformaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const proforma = await db.proformaInvoice.findUnique({
    where: { id: params.id },
    include: {
      party: true,
      createdBy: { select: { ownerName: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!proforma || !canAccessParty(profile, proforma.party)) notFound();

  return (
    <div className="p-8">
      <PageHeader
        title={proforma.proformaNumber}
        subtitle={`${proforma.party.name} · created by ${proforma.createdBy.ownerName}`}
        action={<Badge tone={statusTone(proforma.status)}>{proforma.status}</Badge>}
      />

      <div className="mb-6">
        <ProformaDetailActions proformaId={proforma.id} status={proforma.status} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Issued">
          <p className="text-sm">{formatDate(proforma.issueDate)}</p>
        </Card>
        <Card title="Valid until">
          <p className="text-sm">
            {proforma.validUntil ? formatDate(proforma.validUntil) : "—"}
          </p>
        </Card>
        <Card title="Party">
          <Link
            href={`/parties/${proforma.partyId}`}
            className="text-sm font-medium hover:underline"
          >
            {proforma.party.name}
          </Link>
        </Card>
        <Card title="Total">
          <p className="text-2xl font-semibold">{formatINR(proforma.totalAmount)}</p>
        </Card>
      </div>

      {proforma.status === "CONVERTED" && proforma.convertedToInvoiceId && (
        <div className="mb-6">
          <Card>
            <p className="text-sm">
              Converted to{" "}
              <Link
                href={`/invoices/${proforma.convertedToInvoiceId}`}
                className="font-medium text-primary hover:underline"
              >
                invoice
              </Link>
              .
            </p>
          </Card>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Line items</h2>
        <Table>
          <thead>
            <tr>
              <Th>Description</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Unit price</Th>
              <Th align="right">Tax</Th>
              <Th align="right">Line total</Th>
            </tr>
          </thead>
          <tbody>
            {proforma.lineItems.map((li) => (
              <tr key={li.id}>
                <Td>{li.description}</Td>
                <Td align="right">
                  {li.quantity.toString()}
                  {li.unit ? ` ${li.unit}` : ""}
                </Td>
                <Td align="right">{formatINR(li.unitPrice)}</Td>
                <Td align="right">
                  {formatINR(li.taxAmount)}{" "}
                  <span className="text-muted-foreground">
                    ({li.taxRate.toString()}%)
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-medium">{formatINR(li.lineTotal)}</span>
                </Td>
              </tr>
            ))}
            <tr>
              <Td /><Td /><Td />
              <Td align="right">
                <span className="text-muted-foreground">Subtotal</span>
              </Td>
              <Td align="right">{formatINR(proforma.subtotal)}</Td>
            </tr>
            <tr>
              <Td /><Td /><Td />
              <Td align="right">
                <span className="text-muted-foreground">Tax</span>
              </Td>
              <Td align="right">{formatINR(proforma.taxAmount)}</Td>
            </tr>
            <tr>
              <Td /><Td /><Td />
              <Td align="right">
                <span className="font-semibold">Total</span>
              </Td>
              <Td align="right">
                <span className="font-semibold">{formatINR(proforma.totalAmount)}</span>
              </Td>
            </tr>
          </tbody>
        </Table>
      </section>

      {(proforma.notes || proforma.termsConditions) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {proforma.notes && (
            <Card title="Notes">
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {proforma.notes}
              </p>
            </Card>
          )}
          {proforma.termsConditions && (
            <Card title="Terms & conditions">
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {proforma.termsConditions}
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
