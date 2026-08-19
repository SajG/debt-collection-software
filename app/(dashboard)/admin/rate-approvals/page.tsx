import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { PageHeader, Card } from "../../_components/ui";
import { ApproveRateButton } from "./approve-button";

export const dynamic = "force-dynamic";

// F6 — Rate approval queue. Every SalesOrder with needsRateApproval
// = true, oldest first. Factory can't act on these until an admin
// clears them; the production/page.tsx query hides them for FACTORY.
export default async function RateApprovalsPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const orders = await db.salesOrder.findMany({
    where: { needsRateApproval: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      productRate: true,
      quantity: true,
      quantityUnit: true,
      orderValue: true,
      createdAt: true,
      party: { select: { name: true } },
      newCustomerName: true,
      product: { select: { name: true, floorRate: true } },
      salesperson: { select: { ownerName: true } },
    },
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Rate approvals"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} placed below the product floor rate. Factory can't act on these until you approve or the order is cancelled.`}
      />

      {orders.length === 0 ? (
        <Card title="Nothing waiting">
          <p className="text-sm text-muted-foreground">
            All open orders are at or above their product floor rate.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Card
              key={o.id}
              title={`${o.orderNumber} · ${o.party?.name ?? o.newCustomerName ?? "—"}`}
            >
              <div className="grid gap-3 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Product
                  </p>
                  <p className="font-medium">{o.product?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Rate placed
                  </p>
                  <p className="font-mono font-semibold text-red-700">
                    {o.productRate}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Floor
                  </p>
                  <p className="font-mono">
                    {o.product?.floorRate?.toString() ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Qty · value
                  </p>
                  <p className="font-mono">
                    {o.quantity.toString()} {o.quantityUnit} · ₹
                    {o.orderValue.toString()}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Placed by {o.salesperson?.ownerName ?? "—"} on{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }).format(o.createdAt)}{" "}
                ·{" "}
                <Link
                  className="text-primary underline underline-offset-2"
                  href={`/orders/${o.id}`}
                >
                  Open order
                </Link>
              </p>
              <div className="mt-3">
                <ApproveRateButton orderId={o.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
