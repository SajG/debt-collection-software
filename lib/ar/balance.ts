import { Prisma, type InvoiceStatus } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const D = Prisma.Decimal;
type Dec = InstanceType<typeof D>;

export function startOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Single source of truth for invoice status. OVERDUE wins over PARTIAL when
 * both apply — the remaining paid/pending split stays visible via paidAmount.
 * `settledAmount` = paidAmount + creditedAmount: credit notes settle an
 * invoice the same way payments do, without touching payment rows.
 */
export function deriveInvoiceStatus(
  totalAmount: Dec,
  settledAmount: Dec,
  dueDate: Date,
  now = new Date()
): InvoiceStatus {
  if (settledAmount.greaterThanOrEqualTo(totalAmount)) return "PAID";
  if (dueDate < startOfToday(now)) return "OVERDUE";
  return settledAmount.greaterThan(0) ? "PARTIAL" : "UNPAID";
}

/** Pending balance on an invoice: total − paid − credited. */
export function invoicePending(inv: {
  totalAmount: Dec;
  paidAmount: Dec;
  creditedAmount: Dec;
}): Dec {
  return inv.totalAmount.minus(inv.paidAmount).minus(inv.creditedAmount);
}

/**
 * Recompute the cached Party.totalOutstanding:
 *   Σ(total − paid − credited) over non-cancelled invoices − Σ(unallocated payments).
 * Call inside the same transaction as any invoice/payment/credit-note mutation.
 */
export async function recomputePartyOutstanding(
  tx: Tx,
  partyId: string
): Promise<void> {
  const [inv, onAccount] = await Promise.all([
    tx.invoice.aggregate({
      where: { partyId, status: { not: "CANCELLED" } },
      _sum: { totalAmount: true, paidAmount: true, creditedAmount: true },
    }),
    tx.payment.aggregate({
      where: { partyId, invoiceId: null },
      _sum: { amount: true },
    }),
  ]);

  const outstanding = (inv._sum.totalAmount ?? new D(0))
    .minus(inv._sum.paidAmount ?? new D(0))
    .minus(inv._sum.creditedAmount ?? new D(0))
    .minus(onAccount._sum.amount ?? new D(0));

  await tx.party.update({
    where: { id: partyId },
    data: { totalOutstanding: outstanding },
  });
}

/** Mark past-due unpaid/partial invoices OVERDUE (idempotent; cron + dashboard). */
export async function refreshOverdueStatuses(tx: Tx): Promise<number> {
  const { count } = await tx.invoice.updateMany({
    where: {
      status: { in: ["UNPAID", "PARTIAL"] },
      dueDate: { lt: startOfToday() },
    },
    data: { status: "OVERDUE" },
  });
  return count;
}
