import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { PageHeader, Card, Badge, statusTone } from "../../_components/ui";
import { ORDER_STATUS_LABELS, customerName } from "@/lib/orders/status";

export const dynamic = "force-dynamic";

// Slipping list: orders whose expectedProductionDate is in the past
// but currentStatus is still IN_PRODUCTION. Also surfaces ON_HOLD
// orders in a separate table below — same admin lens for "things
// that shouldn't be sitting where they are".

function daysAgo(d: Date | null): number | null {
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function SlippingOrdersPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const now = new Date();
  const slipping = await db.salesOrder.findMany({
    where: {
      currentStatus: "IN_PRODUCTION",
      expectedProductionDate: { lt: now },
    },
    select: {
      id: true,
      orderNumber: true,
      currentStatus: true,
      quantity: true,
      quantityUnit: true,
      expectedProductionDate: true,
      expectedDeliveryDate: true,
      party: { select: { name: true } },
      newCustomerName: true,
      salesperson: { select: { ownerName: true } },
    },
    orderBy: { expectedProductionDate: "asc" },
  });

  const onHold = await db.salesOrder.findMany({
    where: { currentStatus: "ON_HOLD" },
    select: {
      id: true,
      orderNumber: true,
      currentStatus: true,
      quantity: true,
      quantityUnit: true,
      holdReasonCategory: true,
      holdReason: true,
      party: { select: { name: true } },
      newCustomerName: true,
      salesperson: { select: { ownerName: true } },
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Slipping"
        subtitle="Orders past their production date, and orders sitting on hold. Both need an admin decision."
      />

      <Card
        title={`Past expected production date · ${slipping.length}`}
        className="mb-6"
      >
        {slipping.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing slipping right now. Every IN_PRODUCTION order is within
            its expectedProductionDate.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Salesperson</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Expected prod</th>
                  <th className="py-2 pr-3">Days late</th>
                  <th className="py-2 pr-3">Delivery date</th>
                </tr>
              </thead>
              <tbody>
                {slipping.map((o) => {
                  const late = daysAgo(o.expectedProductionDate);
                  return (
                    <tr
                      key={o.id}
                      className={
                        (late ?? 0) >= 3 ? "border-b bg-red-50/60" : "border-b"
                      }
                    >
                      <td className="py-2 pr-3 font-mono">
                        <Link
                          className="text-primary underline underline-offset-2"
                          href={`/orders/${o.id}`}
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{customerName(o)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {o.salesperson?.ownerName ?? "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {o.quantity.toString()} {o.quantityUnit}
                      </td>
                      <td className="py-2 pr-3">
                        {formatDate(o.expectedProductionDate)}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-red-700">
                        {late ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {formatDate(o.expectedDeliveryDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`On hold · ${onHold.length}`}>
        {onHold.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No orders on hold right now.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Salesperson</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Held since</th>
                </tr>
              </thead>
              <tbody>
                {onHold.map((o) => (
                  <tr key={o.id} className="border-b bg-red-50/40">
                    <td className="py-2 pr-3 font-mono">
                      <Link
                        className="text-primary underline underline-offset-2"
                        href={`/orders/${o.id}`}
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{customerName(o)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {o.salesperson?.ownerName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono tabular-nums">
                      {o.quantity.toString()} {o.quantityUnit}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">
                        {o.holdReasonCategory
                          ?.replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/^./, (c) => c.toUpperCase()) ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.holdReason ?? ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {formatDate(o.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Status legend:{" "}
        <Badge tone={statusTone("IN_PRODUCTION")}>{ORDER_STATUS_LABELS.IN_PRODUCTION}</Badge>{" "}
        <Badge tone={statusTone("ON_HOLD")}>{ORDER_STATUS_LABELS.ON_HOLD}</Badge>{" "}
        <Badge tone={statusTone("PARTIALLY_DISPATCHED")}>
          {ORDER_STATUS_LABELS.PARTIALLY_DISPATCHED}
        </Badge>
      </p>
    </div>
  );
}
