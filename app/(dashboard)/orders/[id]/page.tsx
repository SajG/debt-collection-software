import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessOrder } from "@/lib/authz";
import { formatDate, formatDateTime, formatINR, toNumber } from "@/lib/format";
import { getOrderDocumentSignedUrl } from "@/lib/storage";
import {
  customerName,
  deliveryUrgency,
  ORDER_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/orders/status";
import {
  PageHeader,
  Card,
  Badge,
  statusTone,
  LinkButton,
} from "../../_components/ui";
import { OrderRealtimeRefresh } from "../../_components/order-realtime";
import { CancelOrderButton } from "../cancel-order";
import { DocumentUploadForm } from "../../production/order-actions";
import { AddCommentForm } from "./add-comment-form";
import { RecordInvoiceForm } from "./record-invoice-form";
import { EditOrderForm, ConfirmDeliveryButton } from "./edit-order-form";
import { statusLinkUrl } from "@/lib/status-link";

type StatusEvent = {
  id: string;
  status: import("@prisma/client").OrderStatus;
  notes: string | null;
  createdAt: Date;
  updatedBy: { ownerName: string };
};
type Comment = {
  id: string;
  body: string;
  createdAt: Date;
  author: { ownerName: string; role: import("@prisma/client").Role };
};
type ActivityItem =
  | { kind: "status"; at: Date; ev: StatusEvent }
  | { kind: "comment"; at: Date; c: Comment };

// Merge status events + comments into a single newest-first stream.
// Same shape as either list on its own so the render loop stays trivial.
function mergeActivity(events: StatusEvent[], comments: Comment[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const ev of events) out.push({ kind: "status", at: ev.createdAt, ev });
  for (const c of comments) out.push({ kind: "comment", at: c.createdAt, c });
  out.sort((a, b) => b.at.getTime() - a.at.getTime());
  return out;
}

export default async function SalesOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

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
      comments: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { ownerName: true, role: true } } },
      },
    },
  });
  if (!order || !canAccessOrder(profile, order)) notFound();

  const urgency = deliveryUrgency(order.expectedDeliveryDate);
  const deliveryCls =
    urgency === "overdue"
      ? "text-red-700 font-semibold"
      : urgency === "today"
        ? "text-amber-700 font-semibold"
        : "text-foreground";

  const docsWithUrls = await Promise.all(
    order.documents.map(async (doc) => ({
      ...doc,
      url: await getOrderDocumentSignedUrl(doc.storagePath),
    }))
  );

  const canCancel =
    order.currentStatus !== "DISPATCHED" &&
    order.currentStatus !== "CANCELLED" &&
    (profile.role === "ADMIN" || order.salespersonId === profile.id);

  return (
    <div className="p-4 sm:p-8">
      <OrderRealtimeRefresh orderId={order.id} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LinkButton href="/orders" variant="secondary">
          ← Orders
        </LinkButton>
        {canCancel && <CancelOrderButton orderId={order.id} />}
      </div>

      <PageHeader
        title={order.orderNumber}
        subtitle={customerName(order)}
        action={
          <Badge tone={statusTone(order.currentStatus)}>
            {ORDER_STATUS_LABELS[order.currentStatus]}
          </Badge>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Product
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {order.brand || order.product.brand || "—"} · {order.product.name}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Quantity
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {toNumber(order.quantity)} {order.quantityUnit}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Order value
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {formatINR(order.orderValue)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Expected delivery
          </p>
          <p className={`mt-1 ${deliveryCls}`}>
            {order.expectedDeliveryDate
              ? formatDate(order.expectedDeliveryDate)
              : "—"}
          </p>
        </Card>
      </div>

      <Card title="Order details" className="mb-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Dispatch location" value={order.dispatchLocation} />
          <Detail label="Packing" value={order.packingType} />
          <Detail
            label="Size"
            value={order.sizeKg ? `${order.sizeKg} kg` : null}
          />
          <Detail
            label="Rate"
            value={order.productRate}
          />
          <Detail label="Payment terms" value={order.paymentTerm} />
          <Detail label="Transport" value={order.transportType} />
          <Detail label="Token / Gift" value={order.tokenType} />
          <Detail
            label="Expected production date"
            value={
              order.expectedProductionDate
                ? formatDate(order.expectedProductionDate)
                : null
            }
          />
          <Detail
            label="Salesperson"
            value={order.salesperson.ownerName}
          />
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Activity">
          <p className="mb-4 text-xs text-muted-foreground">
            One chronological view of status changes and comments.
            Append-only — nothing here can be edited or deleted.
          </p>

          <AddCommentForm orderId={order.id} />

          {order.statusEvents.length + order.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            <ol className="space-y-4">
              {mergeActivity(order.statusEvents, order.comments).map((item) =>
                item.kind === "status" ? (
                  <li
                    key={`s:${item.ev.id}`}
                    className="border-l-2 border-primary/30 pl-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(item.ev.status)}>
                        {ORDER_STATUS_LABELS[item.ev.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.ev.createdAt)} ·{" "}
                        {item.ev.updatedBy.ownerName}
                      </span>
                    </div>
                    {item.ev.notes && (
                      <p className="mt-1 text-sm text-foreground">
                        {item.ev.notes}
                      </p>
                    )}
                  </li>
                ) : (
                  <li
                    key={`c:${item.c.id}`}
                    className="border-l-2 border-amber-400/60 bg-amber-50/40 pl-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="amber">Comment</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(item.c.createdAt)} ·{" "}
                        {item.c.author.ownerName} ({item.c.author.role})
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                      {item.c.body}
                    </p>
                  </li>
                ),
              )}
            </ol>
          )}
        </Card>

        {profile.role !== "FACTORY" &&
          order.currentStatus !== "CANCELLED" && (
            (profile.role === "ADMIN" ||
              order.currentStatus === "ORDER_PLACED") && (
              <Card title="Edit order" className="mb-6">
                <EditOrderForm
                  orderId={order.id}
                  role={profile.role}
                  currentStatus={order.currentStatus}
                  currentQuantity={order.quantity.toString()}
                  currentQuantityUnit={order.quantityUnit}
                  currentRate={order.productRate}
                  currentDeliveryDate={
                    order.expectedDeliveryDate
                      ? order.expectedDeliveryDate.toISOString().slice(0, 10)
                      : null
                  }
                />
              </Card>
            )
          )}

        {order.currentStatus === "DISPATCHED" && (
          <Card title="Delivery confirmation" className="mb-6">
            <p className="mb-3 text-sm text-muted-foreground">
              Confirm receipt so the order-to-delivery time series is
              accurate.
            </p>
            <ConfirmDeliveryButton orderId={order.id} />
          </Card>
        )}

        {(profile.role === "ADMIN" || profile.role === "STAFF") &&
          order.currentStatus !== "CANCELLED" && (() => {
            let url: string | null;
            try {
              url = statusLinkUrl(order.id, 30);
            } catch {
              url = null;
            }
            return (
              <Card title="Customer status link" className="mb-6">
                <p className="mb-2 text-xs text-muted-foreground">
                  Read-only, expires in 30 days. Share with the
                  customer so they stop calling for status. Never
                  exposes rates, other orders, or outstanding.
                </p>
                {url ? (
                  <input
                    readOnly
                    value={url}
                    onClick={(e) => e.currentTarget.select()}
                    className="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs font-mono"
                  />
                ) : (
                  <p className="text-xs text-red-600">
                    STATUS_LINK_SECRET is not configured on the deployment.
                    Ask an ops person to set it.
                  </p>
                )}
              </Card>
            );
          })()}

        {(profile.role === "ADMIN" || profile.role === "FACTORY") &&
          order.partyId &&
          !order.linkedInvoiceId &&
          order.currentStatus !== "CANCELLED" && (
            <Card title="Record invoice" className="mb-6">
              <RecordInvoiceForm orderId={order.id} />
            </Card>
          )}
        {order.linkedInvoiceId && (
          <Card title="Attached invoice" className="mb-6">
            <p className="text-sm">
              This order is linked to invoice{" "}
              <a
                className="font-mono text-primary underline-offset-2 hover:underline"
                href={`/invoices/${order.linkedInvoiceId}`}
              >
                {order.linkedInvoiceId}
              </a>
              .
            </p>
          </Card>
        )}

        <Card title="Documents">
          <p className="mb-4 text-xs text-muted-foreground">
            Live — factory uploads invoices & LR here. You can upload an order
            proof (customer PO screenshot, WhatsApp confirmation, etc.) below.
          </p>

          <div className="mb-5 rounded-lg border border-border/60 bg-muted/20 p-4">
            <DocumentUploadForm
              orderId={order.id}
              allowedTypes={
                profile.role === "STAFF"
                  ? ["ORDER_PROOF", "OTHER"]
                  : undefined
              }
            />
          </div>
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
                      className="text-sm font-medium text-primary hover:underline"
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
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}
