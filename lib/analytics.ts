import { db } from "@/lib/db";

// F2 — Analytics queries. Kept in one module so /admin/analytics
// (page) and /api/admin/analytics/export (CSV) render identical data.
// Not scoped by RLS — the page and the API both gate on requireAdmin.

export type AnalyticsRange = {
  from: Date;
  to: Date;
};

export function defaultRange(now = new Date()): AnalyticsRange {
  // Last 90 days trailing window, calendar-aligned to today.
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function ordersBySalesperson(range: AnalyticsRange) {
  const grouped = await db.salesOrder.groupBy({
    by: ["salespersonId"],
    where: {
      createdAt: { gte: range.from, lt: range.to },
      currentStatus: { notIn: ["CANCELLED", "REJECTED"] },
    },
    _count: { _all: true },
    _sum: { orderValue: true },
  });
  const profiles = await db.profile.findMany({
    where: { id: { in: grouped.map((g) => g.salespersonId) } },
    select: { id: true, ownerName: true, role: true },
  });
  const nameById = new Map(profiles.map((p) => [p.id, p]));
  return grouped
    .map((g) => ({
      salespersonId: g.salespersonId,
      name: nameById.get(g.salespersonId)?.ownerName ?? "Unknown",
      role: nameById.get(g.salespersonId)?.role ?? "",
      orderCount: g._count._all,
      totalValue: Number(g._sum.orderValue ?? 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

export async function ordersByProduct(range: AnalyticsRange) {
  const grouped = await db.salesOrder.groupBy({
    by: ["productId"],
    where: {
      createdAt: { gte: range.from, lt: range.to },
      currentStatus: { notIn: ["CANCELLED", "REJECTED"] },
    },
    _count: { _all: true },
    _sum: { orderValue: true, quantity: true },
  });
  const products = await db.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, name: true, brand: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return grouped
    .map((g) => ({
      productId: g.productId,
      name: byId.get(g.productId)?.name ?? "Unknown",
      brand: byId.get(g.productId)?.brand ?? "",
      orderCount: g._count._all,
      totalQuantity: Number(g._sum.quantity ?? 0),
      totalValue: Number(g._sum.orderValue ?? 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

export async function ordersByBrand(range: AnalyticsRange) {
  const grouped = await db.salesOrder.groupBy({
    by: ["brand"],
    where: {
      createdAt: { gte: range.from, lt: range.to },
      currentStatus: { notIn: ["CANCELLED", "REJECTED"] },
    },
    _count: { _all: true },
    _sum: { orderValue: true },
  });
  return grouped
    .map((g) => ({
      brand: g.brand ?? "—",
      orderCount: g._count._all,
      totalValue: Number(g._sum.orderValue ?? 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

export async function ordersByMonth(range: AnalyticsRange) {
  // Groups by year-month in server timezone. Simpler than
  // date_trunc'ing in raw SQL and fine for a ≤12-month rolling
  // window used by a couple of admins.
  const orders = await db.salesOrder.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      currentStatus: { notIn: ["CANCELLED", "REJECTED"] },
    },
    select: { createdAt: true, orderValue: true },
  });
  const map = new Map<string, { orders: number; value: number }>();
  for (const o of orders) {
    const key = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = map.get(key) ?? { orders: 0, value: 0 };
    bucket.orders++;
    bucket.value += Number(o.orderValue);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .map(([month, v]) => ({ month, orderCount: v.orders, totalValue: v.value }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function topCustomers(range: AnalyticsRange, limit = 10) {
  const grouped = await db.salesOrder.groupBy({
    by: ["partyId"],
    where: {
      partyId: { not: null },
      createdAt: { gte: range.from, lt: range.to },
      currentStatus: { notIn: ["CANCELLED", "REJECTED"] },
    },
    _count: { _all: true },
    _sum: { orderValue: true, quantity: true },
  });
  const parties = await db.party.findMany({
    where: { id: { in: grouped.map((g) => g.partyId!).filter(Boolean) } },
    select: { id: true, name: true },
  });
  const byId = new Map(parties.map((p) => [p.id, p.name]));
  return grouped
    .map((g) => ({
      partyId: g.partyId!,
      name: byId.get(g.partyId!) ?? "Unknown",
      orderCount: g._count._all,
      totalQuantity: Number(g._sum.quantity ?? 0),
      totalValue: Number(g._sum.orderValue ?? 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, limit);
}

export async function avgOrderToDispatchHours(range: AnalyticsRange): Promise<{
  count: number;
  avgHours: number | null;
}> {
  // Uses OrderStatusEvent to find the DISPATCHED moment.
  // Only counts orders placed inside the range that reached DISPATCHED
  // (or DELIVERED — same dispatched moment).
  const orders = await db.salesOrder.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      currentStatus: { in: ["DISPATCHED", "DELIVERED"] },
    },
    select: {
      id: true,
      createdAt: true,
      statusEvents: {
        where: { status: "DISPATCHED" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  let totalMs = 0;
  let counted = 0;
  for (const o of orders) {
    const dispatchedAt = o.statusEvents[0]?.createdAt;
    if (!dispatchedAt) continue;
    totalMs += dispatchedAt.getTime() - o.createdAt.getTime();
    counted++;
  }
  return {
    count: counted,
    avgHours: counted === 0 ? null : totalMs / counted / (60 * 60 * 1000),
  };
}

export async function currentHoldOrders() {
  const orders = await db.salesOrder.findMany({
    where: { currentStatus: "ON_HOLD" },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      updatedAt: true,
      holdReasonCategory: true,
      holdReason: true,
      party: { select: { name: true } },
      newCustomerName: true,
      salesperson: { select: { ownerName: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customer: o.party?.name ?? o.newCustomerName ?? "—",
    salesperson: o.salesperson?.ownerName ?? "—",
    reasonCategory: o.holdReasonCategory ?? "OTHER",
    reason: o.holdReason ?? "",
    heldSince: o.updatedAt,
  }));
}
