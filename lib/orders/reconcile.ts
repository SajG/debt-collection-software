import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type PendingOrderMatch = {
  orderId: string;
  orderNumber: string;
  newCustomerName: string;
  createdAt: Date;
  orderValue: string;
  salespersonName: string;
  candidates: Array<{ id: string; name: string; city: string | null; phone: string | null }>;
};

/**
 * Loader for the admin resolver UI: every unlinked "new customer" order,
 * with all case-insensitive Party candidates. UI groups these into
 * "ambiguous" (>1 candidate) and "unmatched" (0 candidates); exact single
 * matches are auto-linked by the nightly job so they usually don't appear.
 */
export async function findPendingCustomerMatches(): Promise<PendingOrderMatch[]> {
  const orders = await db.salesOrder.findMany({
    where: {
      partyId: null,
      newCustomerName: { not: null },
      currentStatus: { notIn: ["CANCELLED", "REJECTED"] },
    },
    select: {
      id: true,
      orderNumber: true,
      newCustomerName: true,
      createdAt: true,
      orderValue: true,
      salesperson: { select: { ownerName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (orders.length === 0) return [];

  // Batch-load candidate parties once per unique lowercase name.
  const uniqueNames = Array.from(
    new Set(orders.map((o) => o.newCustomerName!.trim()))
  );
  const candidatesByKey = new Map<
    string,
    Array<{ id: string; name: string; city: string | null; phone: string | null }>
  >();
  for (const name of uniqueNames) {
    const rows = await db.party.findMany({
      where: {
        name: { equals: name, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true, name: true, city: true, phone: true },
      take: 10,
    });
    candidatesByKey.set(name.toLowerCase(), rows);
  }

  return orders.map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    newCustomerName: o.newCustomerName!,
    createdAt: o.createdAt,
    orderValue: o.orderValue.toString(),
    salespersonName: o.salesperson.ownerName,
    candidates: candidatesByKey.get(o.newCustomerName!.trim().toLowerCase()) ?? [],
  }));
}

export async function linkOrderToParty(
  orderId: string,
  partyId: string,
  updatedById: string
): Promise<{ ok: true } | { error: string }> {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    select: { id: true, partyId: true, newCustomerName: true },
  });
  if (!order) return { error: "Order not found." };
  if (order.partyId) return { error: "Order is already linked to a customer." };

  const party = await db.party.findUnique({
    where: { id: partyId },
    select: { id: true, name: true, isActive: true },
  });
  if (!party || !party.isActive) return { error: "Chosen customer not found." };

  await db.$transaction([
    db.salesOrder.update({
      where: { id: orderId },
      data: { partyId: party.id, newCustomerName: null },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: orderId,
        status: "ORDER_PLACED",
        notes: `Linked to ledger customer "${party.name}" (manual resolve).`,
        updatedById,
      },
    }),
  ]);

  return { ok: true };
}

// Nightly reconcile: promote free-text "new customer" orders to real Party
// rows once the customer has flowed in from Tally.
//
// Match rule: case-insensitive exact name equality. Loose enough to catch
// "New City Hardware" ↔ "NEW CITY HARDWARE" from Tally; strict enough that
// ambiguous partials (e.g. "City Hardware") don't get silently merged into
// the wrong ledger.
//
// Only touches orders where partyId is null AND newCustomerName is set,
// and only where the Party name resolves to exactly one row (skipped +
// reported when ambiguous).

export type ReconcileResult = {
  scanned: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  matches: Array<{
    orderId: string;
    orderNumber: string;
    newCustomerName: string;
    partyId: string;
    partyName: string;
  }>;
  ambiguousNames: string[];
};

export async function reconcileNewCustomerOrders(): Promise<ReconcileResult> {
  const orders = await db.salesOrder.findMany({
    where: {
      partyId: null,
      newCustomerName: { not: null },
      currentStatus: { notIn: ["CANCELLED", "REJECTED"] },
    },
    select: {
      id: true,
      orderNumber: true,
      newCustomerName: true,
      salespersonId: true,
    },
  });

  const result: ReconcileResult = {
    scanned: orders.length,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    matches: [],
    ambiguousNames: [],
  };
  if (orders.length === 0) return result;

  // Group orders by lowercased name so we only hit the DB once per unique
  // customer, even if the salesperson placed multiple orders for the same
  // "new customer" while waiting for the Tally sync.
  const byName = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.newCustomerName!.trim().toLowerCase();
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(o);
    byName.set(key, list);
  }

  for (const [nameKey, group] of Array.from(byName.entries())) {
    const candidates = await db.party.findMany({
      where: {
        name: { equals: group[0].newCustomerName!, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true, name: true, assignedToId: true },
      take: 2,
    });

    if (candidates.length === 0) {
      result.unmatched += group.length;
      continue;
    }
    if (candidates.length > 1) {
      result.ambiguous += group.length;
      result.ambiguousNames.push(group[0].newCustomerName!);
      continue;
    }

    const party = candidates[0];

    // Backfill in a single transaction per group. Append a status event on
    // each order so the history shows the promotion — no silent mutation.
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    for (const order of group) {
      updates.push(
        db.salesOrder.update({
          where: { id: order.id },
          data: {
            partyId: party.id,
            newCustomerName: null,
          },
        })
      );
      updates.push(
        db.orderStatusEvent.create({
          data: {
            salesOrderId: order.id,
            // Same status — event exists purely to record the ledger link.
            status: "ORDER_PLACED",
            notes: `Linked to ledger customer "${party.name}" after Tally sync.`,
            updatedById: order.salespersonId,
          },
        })
      );
      result.matches.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        newCustomerName: order.newCustomerName!,
        partyId: party.id,
        partyName: party.name,
      });
    }
    await db.$transaction(updates);
    result.matched += group.length;

    // Void the cache warning for name lookups next run.
    void nameKey;
  }

  return result;
}
