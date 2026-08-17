import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireFactoryOrAdmin } from "@/lib/authz";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { getOrderDocumentSignedUrl } from "@/lib/storage";
import {
  customerName,
  deliveryUrgency,
  nextOrderStatus,
  ORDER_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/orders/status";
import {
  PageHeader,
  Card,
  Badge,
  statusTone,
  btnSecondaryCls,
} from "../../_components/ui";
import { OrderRealtimeRefresh } from "../../_components/order-realtime";
import {
  AdvanceStatusButton,
  DocumentUploadForm,
  ExpectedProductionDateField,
} from "../order-actions";

export default async function ProductionOrderPage({
  params,
}: {
  params: { id: string };
}) {
  await requireFactoryOrAdmin();

  const order = await db.salesOrder.findUnique({
    where: { id: params.id },
    include: {
      party: { select: { name: true } },
      product: { select: { name: true, brand: true } },
      salesperson: { select: { ownerName: true } },
      statusEvents: {
        orderBy: { createdAt: "desc" },
        include: { updatedBy: { select: { ownerName: true } } },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { ownerName: true } } },
      },
    },
  });
  if (!order) notFound();

  const next = nextOrderStatus(order.currentStatus);
  const urgency = deliveryUrgency(order.expectedDeliveryDate);
  const deliveryCls =
    urgency === "overdue"
      ? "text-red-700 font-bold"
      : urgency === "today"
        ? "text-amber-700 font-bold"
        : "text-foreground";

  const docsWithUrls = await Promise.all(
    order.documents.map(async (doc) => ({
      ...doc,
      url: await getOrderDocumentSignedUrl(doc.storagePath),
    }))
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <OrderRealtimeRefresh orderId={order.id} />

      <div className="mb-4">
        <Link href="/production" className={`${btnSecondaryCls} min-h-11 text-base`}>
          ← Queue
        </Link>
      </div>

      <PageHeader
        title={customerName(order)}
        subtitle={`${order.orderNumber} · ${order.salesperson.ownerName}`}
        action={
          <Badge tone={statusTone(order.currentStatus)}>
            {ORDER_STATUS_LABELS[order.currentStatus]}
          </Badge>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Product
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {order.product.brand}
          </p>
          <p className="text-base text-muted-foreground">{order.product.name}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Quantity
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {toNumber(order.quantity)} {order.quantityUnit}
          </p>
          {(order.packingType || order.sizeKg) && (
            <p className="text-base text-muted-foreground">
              {[order.packingType, order.sizeKg ? `${order.sizeKg} kg` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Expected delivery
          </p>
          <p className={`mt-1 text-lg ${deliveryCls}`}>
            {order.expectedDeliveryDate
              ? formatDate(order.expectedDeliveryDate)
              : "Not set"}
            {urgency === "overdue" && " · Overdue"}
            {urgency === "today" && " · Due today"}
          </p>
        </Card>
      </div>

      <Card title="Order details" className="mb-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProdDetail label="Dispatch location" value={order.dispatchLocation} />
          <ProdDetail label="Rate" value={order.productRate} />
          <ProdDetail label="Payment terms" value={order.paymentTerm} />
          <ProdDetail label="Transport" value={order.transportType} />
          <ProdDetail label="Token / Gift" value={order.tokenType} />
          {order.notes && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {order.notes}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Production planning" className="mb-6">
        <ExpectedProductionDateField
          orderId={order.id}
          currentYmd={
            order.expectedProductionDate
              ? order.expectedProductionDate.toISOString().slice(0, 10)
              : null
          }
        />
      </Card>

      {next ? (
        <div className="mb-8">
          <AdvanceStatusButton
            orderId={order.id}
            currentStatus={order.currentStatus}
            nextStatus={next}
          />
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-border bg-muted/40 px-5 py-4 text-base text-muted-foreground">
          This order is {ORDER_STATUS_LABELS[order.currentStatus].toLowerCase()} —
          no further status steps.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upload document">
          <DocumentUploadForm orderId={order.id} />
        </Card>

        <Card title="Documents">
          {docsWithUrls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            <ul className="space-y-3">
              {docsWithUrls.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {DOCUMENT_TYPE_LABELS[doc.type]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(doc.createdAt)} · {doc.uploadedBy.ownerName}
                    </p>
                  </div>
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`${btnSecondaryCls} min-h-11`}
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unavailable</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Status history">
          {order.statusEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status events yet.</p>
          ) : (
            <ol className="space-y-4">
              {order.statusEvents.map((ev) => (
                <li key={ev.id} className="border-l-2 border-primary/30 pl-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(ev.status)}>
                      {ORDER_STATUS_LABELS[ev.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(ev.createdAt)} · {ev.updatedBy.ownerName}
                    </span>
                  </div>
                  {ev.notes && (
                    <p className="mt-1 text-sm text-foreground">{ev.notes}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function ProdDetail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}
