import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { isTallyEnabled } from "@/lib/settings";
import { PageHeader, Card, Badge } from "../../_components/ui";
import { ORDER_STATUS_LABELS } from "@/lib/orders/status";

export const dynamic = "force-dynamic";

// Production planning — group open (non-terminal) orders by product
// so the factory can batch. Pending quantity per product against
// StockItem when the Tally sync is populating it.
//
// FACTORY + ADMIN only; STAFF wouldn't act on this data.
export default async function ProductionPlanningPage() {
  const profile = await requireProfile();
  if (profile.role !== "FACTORY" && profile.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const OPEN_STATUSES = [
    "ORDER_PLACED",
    "IN_PRODUCTION",
    "ON_HOLD",
    "READY_TO_DISPATCH",
    "PARTIALLY_DISPATCHED",
  ] as const;

  const [orders, stockRows, tallyOn] = await Promise.all([
    db.salesOrder.findMany({
      where: { currentStatus: { in: [...OPEN_STATUSES] } },
      select: {
        id: true,
        orderNumber: true,
        quantity: true,
        quantityUnit: true,
        currentStatus: true,
        expectedDeliveryDate: true,
        brand: true,
        party: { select: { name: true } },
        newCustomerName: true,
        product: { select: { id: true, name: true, brand: true } },
      },
      orderBy: { expectedDeliveryDate: "asc" },
    }),
    db.stockItem.findMany({
      select: { name: true, closingQty: true, unit: true },
    }),
    isTallyEnabled(),
  ]);

  // Group by product (name + brand). closingQty is looked up by
  // product name only — Tally stock names don't carry brand.
  const stockByName = new Map<string, { qty: number; unit: string | null }>();
  for (const s of stockRows) {
    stockByName.set(s.name.toLowerCase(), {
      qty: Number(s.closingQty),
      unit: s.unit,
    });
  }

  type Grouped = {
    key: string;
    productName: string;
    brand: string | null;
    pendingUnits: Map<string, number>; // unit → total
    orders: (typeof orders)[number][];
    stockQty: number | null;
    stockUnit: string | null;
  };

  const groups = new Map<string, Grouped>();
  for (const o of orders) {
    const productName = o.product?.name ?? "Unknown";
    const brand = o.brand ?? o.product?.brand ?? null;
    const key = `${productName}::${brand ?? ""}`;
    const stock = stockByName.get(productName.toLowerCase());
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        productName,
        brand,
        pendingUnits: new Map(),
        orders: [],
        stockQty: stock?.qty ?? null,
        stockUnit: stock?.unit ?? null,
      });
    }
    const g = groups.get(key)!;
    g.orders.push(o);
    const prev = g.pendingUnits.get(o.quantityUnit) ?? 0;
    g.pendingUnits.set(o.quantityUnit, prev + Number(o.quantity));
  }

  const rows = Array.from(groups.values()).sort((a, b) => {
    // Biggest pending workload first — the metric a planner scans.
    const sum = (m: Map<string, number>) =>
      Array.from(m.values()).reduce((acc, v) => acc + v, 0);
    return sum(b.pendingUnits) - sum(a.pendingUnits);
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Production planning"
        subtitle={`${orders.length} open order${orders.length === 1 ? "" : "s"} across ${rows.length} product${rows.length === 1 ? "" : "s"}. Sorted by total pending quantity.`}
      />

      {rows.length === 0 ? (
        <Card title="Nothing pending">
          <p className="text-sm text-muted-foreground">
            Every order is dispatched or terminal.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((g) => {
            const pendingSummary = Array.from(g.pendingUnits.entries())
              .map(([unit, qty]) => `${qty.toLocaleString("en-IN")} ${unit}`)
              .join(" · ");
            const primaryUnit = Array.from(g.pendingUnits.keys())[0];
            const primaryPending = g.pendingUnits.get(primaryUnit ?? "") ?? 0;
            const shortfall =
              g.stockQty != null &&
              g.stockUnit &&
              g.stockUnit === primaryUnit &&
              g.stockQty < primaryPending
                ? primaryPending - g.stockQty
                : null;
            return (
              <Card
                key={g.key}
                title={`${g.productName}${g.brand ? ` · ${g.brand}` : ""}`}
              >
                <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pending
                    </span>
                    <br />
                    <span className="font-mono text-lg font-semibold">
                      {pendingSummary}
                    </span>
                  </span>
                  <span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Orders
                    </span>
                    <br />
                    <span className="font-mono text-lg font-semibold">
                      {g.orders.length}
                    </span>
                  </span>
                  {tallyOn && g.stockQty != null && (
                    <span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Stock (Tally)
                      </span>
                      <br />
                      <span
                        className={
                          shortfall != null
                            ? "font-mono text-lg font-semibold text-red-700"
                            : "font-mono text-lg font-semibold"
                        }
                      >
                        {g.stockQty.toLocaleString("en-IN")}{" "}
                        <span className="text-xs text-muted-foreground">
                          {g.stockUnit ?? ""}
                        </span>
                      </span>
                    </span>
                  )}
                  {shortfall != null && (
                    <Badge tone="danger">
                      Shortfall: {shortfall.toLocaleString("en-IN")}{" "}
                      {primaryUnit}
                    </Badge>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Order</th>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Wanted by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.orders.map((o) => (
                      <tr key={o.id} className="border-b">
                        <td className="py-2 pr-3 font-mono">
                          <a
                            className="text-primary underline-offset-2 hover:underline"
                            href={`/orders/${o.id}`}
                          >
                            {o.orderNumber}
                          </a>
                        </td>
                        <td className="py-2 pr-3">
                          {o.party?.name ?? o.newCustomerName ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums">
                          {o.quantity.toString()} {o.quantityUnit}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {ORDER_STATUS_LABELS[o.currentStatus]}
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {o.expectedDeliveryDate
                            ? new Intl.DateTimeFormat("en-IN", {
                                day: "2-digit",
                                month: "short",
                              }).format(o.expectedDeliveryDate)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
