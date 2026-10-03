import Link from "next/link";
import { tenantDb } from "@/lib/tenant";
import { requireFactoryOrAdmin } from "@/lib/authz";
import { formatDate, toNumber } from "@/lib/format";
import {
  customerName,
  deliveryUrgency,
  isFactoryReadOnlyOrder,
  ORDER_STATUS_LABELS,
} from "@/lib/orders/status";
import { PageHeader, Badge, statusTone } from "../_components/ui";

export default async function ProductionQueuePage() {
  const profile = await requireFactoryOrAdmin();
  const db = tenantDb(profile.organizationId);

  // Audit item 10: FACTORY sees the whole pipeline, PENDING_APPROVAL
  // and needsRateApproval rows included, so the shop floor is never
  // blind to what's coming. Read-only styling + a "Waiting for
  // management approval" badge take the place of the old hide.
  const isFactory = profile.role === "FACTORY";
  const orders = await db.salesOrder.findMany({
    where: {
      currentStatus: {
        notIn: isFactory
          ? ["DISPATCHED", "DELIVERED", "CANCELLED"]
          : [
              "DISPATCHED",
              "DELIVERED",
              "CANCELLED",
              // ADMIN keeps a dedicated approval screen (/admin/approvals)
              // + a rate-approvals queue; the main production queue
              // hides PENDING / REJECTED so the two views don't overlap.
              "PENDING_APPROVAL",
              "REJECTED",
            ],
      },
    },
    include: {
      party: { select: { name: true } },
      product: { select: { name: true, brand: true } },
      items: {
        orderBy: { lineNumber: "asc" },
        select: {
          lineNumber: true,
          brand: true,
          quantity: true,
          quantityUnit: true,
          product: { select: { name: true, brand: true } },
        },
      },
    },
    orderBy: [
      { expectedDeliveryDate: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Production queue"
        subtitle={`${orders.length} open order${orders.length === 1 ? "" : "s"} — tap a row to update status or upload documents`}
      />

      {orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-16 text-center text-lg text-muted-foreground shadow-sm">
          No open orders in the queue.
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const urgency = deliveryUrgency(order.expectedDeliveryDate);
            const qty = `${toNumber(order.quantity)} ${order.quantityUnit}`;
            const lineCount = order.items.length;
            const deliveryCls =
              urgency === "overdue"
                ? "text-red-700 font-bold"
                : urgency === "today"
                  ? "text-amber-700 font-bold"
                  : "text-foreground";
            const readOnly =
              isFactory &&
              isFactoryReadOnlyOrder({
                currentStatus: order.currentStatus,
                needsRateApproval: order.needsRateApproval,
              });

            return (
              <li key={order.id}>
                <Link
                  href={`/production/${order.id}`}
                  aria-disabled={readOnly}
                  className={
                    readOnly
                      ? "block rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 p-4 opacity-90 transition-colors hover:bg-slate-100 sm:p-5"
                      : "block rounded-xl border-2 border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20 active:bg-muted/40 sm:p-5"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                        {customerName(order)}
                      </p>
                      <p className="mt-1 text-base text-muted-foreground sm:text-lg">
                        {order.product.brand} · {order.product.name}
                        {lineCount > 1 ? ` · +${lineCount - 1} more` : ""}
                      </p>
                      <p className="mt-1 font-mono text-sm text-muted-foreground">
                        {order.orderNumber}
                      </p>
                    </div>
                    {readOnly ? (
                      <span
                        className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                        title="Read-only until management approves the order or its rate"
                      >
                        Waiting for management approval
                      </span>
                    ) : (
                      <Badge tone={statusTone(order.currentStatus)}>
                        {ORDER_STATUS_LABELS[order.currentStatus]}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-base sm:grid-cols-3 sm:text-lg">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Quantity
                      </p>
                      <p className="font-semibold text-foreground">
                        {lineCount > 1 ? `${lineCount} lines` : qty}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Delivery
                      </p>
                      <p className={deliveryCls}>
                        {order.expectedDeliveryDate
                          ? formatDate(order.expectedDeliveryDate)
                          : "—"}
                        {urgency === "overdue" && " · Overdue"}
                        {urgency === "today" && " · Due today"}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {readOnly ? "Status" : "Open"}
                      </p>
                      <p
                        className={
                          readOnly
                            ? "font-semibold text-slate-500"
                            : "font-semibold text-primary"
                        }
                      >
                        {readOnly ? "View only" : "Update →"}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
