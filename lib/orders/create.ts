import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Indian FY label: April–March → "YY-YY" (e.g. "25-26"). */
export function currentFyLabel(now = new Date()): string {
  const year = now.getFullYear() % 100;
  const month = now.getMonth();
  const start = month >= 3 ? year : year - 1;
  const end = start + 1;
  return `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

/**
 * Next order number in `SB/YY-YY/NNNN` form. Uses a per-FY count under a
 * serialisable transaction so two concurrent creates cannot collide on the
 * unique `orderNumber` index.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  now = new Date()
): Promise<string> {
  const fy = currentFyLabel(now);
  const prefix = `SB/${fy}/`;
  const count = await tx.salesOrder.count({
    where: { orderNumber: { startsWith: prefix } },
  });
  const seq = String(count + 1).padStart(4, "0");
  return `${prefix}${seq}`;
}

export type CreditPreview = {
  outstanding: number;
  creditLimit: number | null;
  projectedTotal: number;
  wouldExceed: boolean;
  headroom: number | null;
};

/** Pure — takes party numbers + new order value and reports the projection. */
export function previewCredit(
  party: {
    totalOutstanding: Prisma.Decimal | number | string;
    creditLimit: Prisma.Decimal | number | string | null;
  },
  orderValue: number
): CreditPreview {
  const outstanding = Number(party.totalOutstanding.toString());
  const creditLimit =
    party.creditLimit == null ? null : Number(party.creditLimit.toString());
  const projectedTotal = outstanding + orderValue;
  const wouldExceed = creditLimit != null && projectedTotal > creditLimit;
  const headroom = creditLimit == null ? null : creditLimit - outstanding;
  return { outstanding, creditLimit, projectedTotal, wouldExceed, headroom };
}
