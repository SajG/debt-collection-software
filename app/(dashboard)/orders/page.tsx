import Link from "next/link";
import type { Prisma, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { formatDate, formatINR, toNumber } from "@/lib/format";
import {
  customerName,
  deliveryUrgency,
  ORDER_STATUS_LABELS,
} from "@/lib/orders/status";
import {
  PageHeader,
  LinkButton,
  Badge,
  statusTone,
  Table,
  Th,
  Td,
  EmptyRow,
} from "../_components/ui";

type StatusFilter = "open" | "all" | OrderStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "ORDER_PLACED", label: "Placed" },
  { key: "IN_PRODUCTION", label: "In production" },
  { key: "READY_TO_DISPATCH", label: "Ready" },
  { key: "DISPATCHED", label: "Dispatched" },
  { key: "all", label: "All" },
];

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const profile = await requireProfile();

  const active = (STATUS_TABS.find((t) => t.key === searchParams.status)?.key ??
    "open") as StatusFilter;

  const where: Prisma.SalesOrderWhereInput = {};
  if (profile.role === "STAFF") {
    where.salespersonId = profile.id;
  }
  if (active === "open") {
    where.currentStatus = { notIn: ["DISPATCHED", "CANCELLED"] };
  } else if (active !== "all") {
    where.currentStatus = active as OrderStatus;
  }

  const [orders, openTotal] = await Promise.all([
    db.salesOrder.findMany({
      where,
      include: {
        party: { select: { name: true } },
        product: { select: { name: true, brand: true } },
        salesperson: { select: { ownerName: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
    db.salesOrder.aggregate({
      where: {
        ...(profile.role === "STAFF" ? { salespersonId: profile.id } : {}),
        currentStatus: { notIn: ["DISPATCHED", "CANCELLED"] },
      },
      _sum: { orderValue: true },
      _count: true,
    }),
  ]);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={profile.role === "STAFF" ? "My orders" : "Orders"}
        subtitle={
          profile.role === "STAFF"
            ? "Orders you've placed — factory updates status live."
            : "All sales orders across the team."
        }
        action={<LinkButton href="/orders/new">+ New order</LinkButton>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Open orders
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {openTotal._count}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Open order value
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatINR(openTotal._sum.orderValue ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Showing
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {orders.length}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "open" ? "/orders" : `/orders?status=${t.key}`}
            className={[
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              active === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-white text-foreground hover:bg-muted",
            ].join(" ")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Customer</Th>
            <Th>Product</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Value</Th>
            <Th>Delivery</Th>
            <Th>Status</Th>
            {profile.role !== "STAFF" && <Th>Salesperson</Th>}
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <EmptyRow
              colSpan={profile.role === "STAFF" ? 7 : 8}
              message="No orders yet — tap + New order to place one."
            />
          ) : (
            orders.map((o) => {
              const urgency = deliveryUrgency(o.expectedDeliveryDate);
              const deliveryCls =
                urgency === "overdue"
                  ? "text-red-700 font-semibold"
                  : urgency === "today"
                    ? "text-amber-700 font-semibold"
                    : "text-foreground";
              return (
                <tr key={o.id} className="hover:bg-muted/30">
                  <Td>
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-mono text-sm text-primary hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </p>
                  </Td>
                  <Td>
                    <span className="font-medium text-foreground">
                      {customerName(o)}
                    </span>
                    {!o.partyId && (
                      <span className="ml-2">
                        <Badge tone="amber">New</Badge>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-foreground">{o.product.brand}</span>
                    <p className="text-xs text-muted-foreground">
                      {o.product.name}
                    </p>
                  </Td>
                  <Td align="right">
                    {toNumber(o.quantity)} {o.quantityUnit}
                  </Td>
                  <Td align="right">{formatINR(o.orderValue)}</Td>
                  <Td>
                    <span className={deliveryCls}>
                      {o.expectedDeliveryDate
                        ? formatDate(o.expectedDeliveryDate)
                        : "—"}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(o.currentStatus)}>
                      {ORDER_STATUS_LABELS[o.currentStatus]}
                    </Badge>
                  </Td>
                  {profile.role !== "STAFF" && (
                    <Td>{o.salesperson.ownerName}</Td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
