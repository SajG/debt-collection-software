import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import {
  PageHeader,
  Card,
  Badge,
  Table,
  Th,
  Td,
} from "../../_components/ui";
import { orderStatusTone } from "../order-status";
import { OrderDetailActions } from "./order-detail-actions";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const order = await db.salesOrder.findUnique({
    where: { id: params.id },
    include: {
      party: true,
      product: true,
      salesperson: { select: { id: true, ownerName: true } },
      linkedInvoice: {
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          invoiceDate: true,
          status: true,
        },
      },
      statusEvents: {
        include: { updatedBy: { select: { ownerName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order || !canAccessParty(profile, order.party)) notFound();
  if (profile.role === "STAFF" && order.salespersonId !== profile.id) {
    notFound();
  }

  const linkable =
    order.currentStatus === "LR_GENERATED" ||
    order.currentStatus === "DISPATCHED";

  const invoiceOptions = linkable
    ? await db.invoice.findMany({
        where: { partyId: order.partyId, status: { not: "CANCELLED" } },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          invoiceDate: true,
        },
        orderBy: { invoiceDate: "desc" },
        take: 100,
      })
    : [];

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={order.orderNumber}
        subtitle={`${order.party.name} · ${order.salesperson.ownerName}`}
        action={
          <Badge tone={orderStatusTone(order.currentStatus)}>
            {order.currentStatus.replace(/_/g, " ")}
          </Badge>
        }
      />

      <div className="mb-6">
        <OrderDetailActions
          orderId={order.id}
          status={order.currentStatus}
          linkedInvoice={order.linkedInvoice}
          invoiceOptions={invoiceOptions.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            totalAmount: inv.totalAmount.toString(),
            invoiceDate: inv.invoiceDate.toISOString(),
          }))}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Party">
          <Link
            href={`/parties/${order.partyId}`}
            className="text-sm font-medium hover:underline"
          >
            {order.party.name}
          </Link>
        </Card>
        <Card title="Product">
          <p className="text-sm font-medium">{order.product.name}</p>
          {order.brand && (
            <p className="text-xs text-muted-foreground">{order.brand}</p>
          )}
        </Card>
        <Card title="Quantity">
          <p className="text-2xl font-semibold">
            {order.quantity.toString()}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {order.quantityUnit}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {order.packingType} · {order.sizeKg} kg · {order.productRate}
          </p>
        </Card>
        <Card title="Expected delivery">
          <p className="text-sm">
            {order.expectedDeliveryDate
              ? formatDate(order.expectedDeliveryDate)
              : "—"}
          </p>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Payment term">
          <p className="text-sm">{order.paymentTerm.replace(/_/g, " ")}</p>
        </Card>
        <Card title="Transport">
          <p className="text-sm">{order.transportType.replace(/_/g, " ")}</p>
        </Card>
        <Card title="Token">
          <p className="text-sm">{order.tokenType || "—"}</p>
        </Card>
      </div>

      {order.linkedInvoice && (
        <div className="mb-6">
          <Card title="Linked invoice">
            <p className="text-sm">
              <Link
                href={`/invoices/${order.linkedInvoice.id}`}
                className="font-medium text-primary hover:underline"
              >
                {order.linkedInvoice.invoiceNumber}
              </Link>{" "}
              · {formatINR(order.linkedInvoice.totalAmount)} ·{" "}
              {formatDate(order.linkedInvoice.invoiceDate)}
            </p>
          </Card>
        </div>
      )}

      {order.notes && (
        <div className="mb-6">
          <Card title="Notes">
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {order.notes}
            </p>
          </Card>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Status timeline
        </h2>
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Status</Th>
              <Th>Updated by</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {order.statusEvents.map((ev) => (
              <tr key={ev.id}>
                <Td>{formatDateTime(ev.createdAt)}</Td>
                <Td>
                  <Badge tone={orderStatusTone(ev.status)}>
                    {ev.status.replace(/_/g, " ")}
                  </Badge>
                </Td>
                <Td>{ev.updatedBy.ownerName}</Td>
                <Td>
                  <span className="whitespace-pre-line text-sm text-muted-foreground">
                    {ev.notes || "—"}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
