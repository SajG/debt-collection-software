import Link from "next/link";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { formatDate } from "@/lib/format";
import { ProductionItem } from "./production-item";

// Tablet-first: fixed large type, oversized touch targets, high contrast.
// The queue itself is a server component so the initial paint is fast on
// weak factory-floor tablets; per-row interactions are the only client bit.
export default async function ProductionPage() {
  const profile = await requireProfile();

  const orders = await db.salesOrder.findMany({
    where: {
      currentStatus: {
        notIn: ["DISPATCHED", "CANCELLED"],
      },
    },
    select: {
      id: true,
      orderNumber: true,
      currentStatus: true,
      quantity: true,
      quantityUnit: true,
      packingType: true,
      sizeKg: true,
      expectedDeliveryDate: true,
      party: { select: { name: true } },
      product: { select: { name: true, brand: true } },
      salesperson: { select: { ownerName: true } },
    },
    // Nulls-last on expectedDeliveryDate so undated orders don't monopolise
    // the top of the queue.
    orderBy: [
      { expectedDeliveryDate: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    take: 200,
  });

  const today = startOfDay(new Date());
  const canAdvance = profile.role !== "STAFF" || false;
  // STAFF users see the queue read-only from here — floor advancement is
  // FACTORY or ADMIN. STAFF still manage their own orders via /orders.
  const isFloorUser = profile.role === "FACTORY" || profile.role === "ADMIN";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Production queue
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              {orders.length} open order{orders.length === 1 ? "" : "s"} · sorted
              by expected delivery
            </p>
          </div>
          <Link
            href="/orders"
            className="rounded-lg border border-border bg-white px-4 py-3 text-base font-medium text-foreground hover:bg-muted"
          >
            All orders
          </Link>
        </header>

        {orders.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-xl font-medium text-foreground">
              Queue is empty.
            </p>
            <p className="mt-2 text-base text-muted-foreground">
              All open orders have been dispatched. Nice work.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const days = o.expectedDeliveryDate
                ? differenceInCalendarDays(o.expectedDeliveryDate, today)
                : null;
              const urgency: "overdue" | "today" | "future" | "none" =
                days === null
                  ? "none"
                  : days < 0
                    ? "overdue"
                    : days === 0
                      ? "today"
                      : "future";
              return (
                <ProductionItem
                  key={o.id}
                  order={{
                    id: o.id,
                    orderNumber: o.orderNumber,
                    partyName: o.party.name,
                    productName: o.product.name,
                    brand: o.product.brand,
                    quantity: o.quantity.toString(),
                    quantityUnit: o.quantityUnit,
                    packingType: o.packingType,
                    sizeKg: o.sizeKg,
                    salespersonName: o.salesperson.ownerName,
                    currentStatus: o.currentStatus,
                    expectedDate: o.expectedDeliveryDate
                      ? formatDate(o.expectedDeliveryDate)
                      : null,
                    urgency,
                    urgencyDays: days,
                  }}
                  canAdvance={isFloorUser || canAdvance}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
