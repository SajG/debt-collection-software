import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { formatINR } from "@/lib/format";
import { PageHeader, Card, Badge } from "../../_components/ui";
import { ApprovalActions } from "./approval-actions";

export const dynamic = "force-dynamic";

// P1 — unified approval queue. Every PENDING_APPROVAL order in one
// place, with the three reasons an order lands here (below-floor
// rate, over credit limit, unrecognised new customer) shown side by
// side with the numbers a director needs to decide in one glance.
//
// Old /admin/rate-approvals route redirects here.
export default async function ApprovalsPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const orders = await db.salesOrder.findMany({
    where: {
      OR: [
        { currentStatus: "PENDING_APPROVAL" },
        {
          needsRateApproval: true,
          currentStatus: { notIn: ["REJECTED", "CANCELLED"] },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      productRate: true,
      quantity: true,
      quantityUnit: true,
      orderValue: true,
      createdAt: true,
      needsRateApproval: true,
      creditCheckPassed: true,
      partyId: true,
      newCustomerName: true,
      party: {
        select: {
          id: true,
          name: true,
          totalOutstanding: true,
          creditLimit: true,
        },
      },
      product: { select: { name: true, floorRate: true } },
      salesperson: { select: { ownerName: true } },
    },
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Approvals"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} awaiting your decision. Each one is here for a specific reason — the numbers below make the call in one glance.`}
      />

      {orders.length === 0 ? (
        <Card title="Nothing waiting">
          <p className="text-sm text-muted-foreground">
            All orders are either flowing through the factory or already
            terminal. Set BusinessSettings.orderApprovalMode = ALL if
            you want to review every routine order too.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const isNewCustomer = o.partyId == null && !!o.newCustomerName;
            const isOverLimit = o.creditCheckPassed === false;
            const isBelowFloor = o.needsRateApproval === true;
            const reasons: {
              label: string;
              lhs: string;
              rhs: string;
              tone: "danger" | "amber" | "info";
            }[] = [];
            if (isBelowFloor) {
              reasons.push({
                label: "Below floor rate",
                lhs: `rate ${o.productRate}`,
                rhs: `floor ${o.product?.floorRate?.toString() ?? "—"}`,
                tone: "danger",
              });
            }
            if (isOverLimit && o.party) {
              const outstanding = Number(o.party.totalOutstanding);
              const projected = outstanding + Number(o.orderValue);
              const limit = o.party.creditLimit
                ? Number(o.party.creditLimit)
                : null;
              reasons.push({
                label: "Over credit limit",
                lhs: `${formatINR(outstanding)} + ${formatINR(Number(o.orderValue))} = ${formatINR(projected)}`,
                rhs: `limit ${limit != null ? formatINR(limit) : "—"}`,
                tone: "danger",
              });
            }
            if (isNewCustomer) {
              reasons.push({
                label: "New customer (no ledger)",
                lhs: `"${o.newCustomerName ?? ""}"`,
                rhs: "not yet in Party ledger",
                tone: "amber",
              });
            }
            return (
              <Card
                key={o.id}
                title={`${o.orderNumber} · ${o.party?.name ?? o.newCustomerName ?? "—"}`}
              >
                <div className="mb-3 grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Product
                    </p>
                    <p className="font-medium">{o.product?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Quantity
                    </p>
                    <p className="font-mono">
                      {o.quantity.toString()} {o.quantityUnit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Value
                    </p>
                    <p className="font-mono">
                      {formatINR(Number(o.orderValue))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Placed by
                    </p>
                    <p className="text-muted-foreground">
                      {o.salesperson?.ownerName ?? "—"}
                    </p>
                  </div>
                </div>
                {reasons.length > 0 ? (
                  <div className="mb-3 space-y-2">
                    {reasons.map((r) => (
                      <div
                        key={r.label}
                        className="rounded-md border border-amber-200 bg-amber-50/40 p-2 text-xs"
                      >
                        <div className="mb-0.5 flex items-center gap-2">
                          <Badge tone={r.tone}>{r.label}</Badge>
                        </div>
                        <div className="font-mono">
                          <span className="text-red-700">{r.lhs}</span>{" "}
                          <span className="text-muted-foreground">
                            vs
                          </span>{" "}
                          <span>{r.rhs}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Held under orderApprovalMode = ALL — no exception
                    triggered.
                  </p>
                )}
                <p className="mb-3 text-xs text-muted-foreground">
                  Placed{" "}
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
                <ApprovalActions orderId={o.id} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
