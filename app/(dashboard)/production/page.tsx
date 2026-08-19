import Link from "next/link";
import { db } from "@/lib/db";
import { requireFactoryOrAdmin } from "@/lib/authz";
import { formatDate, toNumber } from "@/lib/format";
import {
  customerName,
  deliveryUrgency,
  ORDER_STATUS_LABELS,
} from "@/lib/orders/status";
import { PageHeader, Badge, statusTone } from "../_components/ui";

export default async function ProductionQueuePage() {
  const profile = await requireFactoryOrAdmin();

  const orders = await db.salesOrder.findMany({
    where: {
      currentStatus: { notIn: ["DISPATCHED", "DELIVERED", "CANCELLED"] },
      // F6 — orders below the product floor rate are hidden from the
      // factory queue until an admin approves the rate. Admins still
      // see them so they can approve or decide.
      ...(profile.role === "FACTORY" ? { needsRateApproval: false } : {}),
    },
    include: {
      party: { select: { name: true } },
      product: { select: { name: true, brand: true } },
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
            const deliveryCls =
              urgency === "overdue"
                ? "text-red-700 font-bold"
                : urgency === "today"
                  ? "text-amber-700 font-bold"
                  : "text-foreground";

            return (
              <li key={order.id}>
                <Link
                  href={`/production/${order.id}`}
                  className="block rounded-xl border-2 border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20 active:bg-muted/40 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                        {customerName(order)}
                      </p>
                      <p className="mt-1 text-base text-muted-foreground sm:text-lg">
                        {order.product.brand} · {order.product.name}
                      </p>
                      <p className="mt-1 font-mono text-sm text-muted-foreground">
                        {order.orderNumber}
                      </p>
                    </div>
                    <Badge tone={statusTone(order.currentStatus)}>
                      {ORDER_STATUS_LABELS[order.currentStatus]}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-base sm:grid-cols-3 sm:text-lg">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Quantity
                      </p>
                      <p className="font-semibold text-foreground">{qty}</p>
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
                        Open
                      </p>
                      <p className="font-semibold text-primary">Update →</p>
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
