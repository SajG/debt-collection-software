// Statement of account — pure ledger maths, no DB access. Unit-tested
// in lib/ar/__tests__/statement.test.ts.
//
// A statement is the customer's ledger for a period: an opening
// balance, then every invoice (debit), payment (credit) and credit
// note (credit) in date order with a running balance, and an ageing
// summary of what is still unpaid on the closing date.

import { agingSummary, type AgingSummary } from "./aging";

export type StatementInvoice = {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  paidAmount: number;
  creditedAmount: number;
  cancelled: boolean;
};
export type StatementPayment = {
  paymentDate: Date;
  amount: number;
  method: string;
  reference: string | null;
  invoiceNumber: string | null;
};
export type StatementCreditNote = {
  creditNoteNumber: string;
  issuedAt: Date;
  amount: number;
  invoiceNumber: string | null;
  cancelled: boolean;
};

export type StatementRow = {
  date: Date;
  kind: "INVOICE" | "PAYMENT" | "CREDIT_NOTE";
  /** Invoice number, payment reference or credit-note number. */
  ref: string;
  detail: string;
  debit: number;
  credit: number;
  /** Balance owed after this row. Negative = the customer is in credit. */
  balance: number;
};

export type Statement = {
  from: Date;
  to: Date;
  openingBalance: number;
  rows: StatementRow[];
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  /** Unpaid invoice amounts on `to`, by how late they are. */
  ageing: AgingSummary;
  /** Sum of the ageing buckets that are past due. */
  overdue: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Same-day order: the invoice first, then what settled it.
const KIND_ORDER: Record<StatementRow["kind"], number> = {
  INVOICE: 0,
  CREDIT_NOTE: 1,
  PAYMENT: 2,
};

export function buildStatement(input: {
  invoices: StatementInvoice[];
  payments: StatementPayment[];
  creditNotes: StatementCreditNote[];
  from: Date;
  to: Date;
}): Statement {
  const { from, to } = input;
  const invoices = input.invoices.filter((i) => !i.cancelled && i.invoiceDate <= to);
  const payments = input.payments.filter((p) => p.paymentDate <= to);
  const creditNotes = input.creditNotes.filter((c) => !c.cancelled && c.issuedAt <= to);

  // Everything before the period collapses into the opening balance.
  let opening = 0;
  for (const i of invoices) if (i.invoiceDate < from) opening += i.totalAmount;
  for (const p of payments) if (p.paymentDate < from) opening -= p.amount;
  for (const c of creditNotes) if (c.issuedAt < from) opening -= c.amount;
  opening = round2(opening);

  const entries: Omit<StatementRow, "balance">[] = [];
  for (const i of invoices) {
    if (i.invoiceDate < from) continue;
    entries.push({
      date: i.invoiceDate,
      kind: "INVOICE",
      ref: i.invoiceNumber,
      detail: "Invoice",
      debit: i.totalAmount,
      credit: 0,
    });
  }
  for (const p of payments) {
    if (p.paymentDate < from) continue;
    entries.push({
      date: p.paymentDate,
      kind: "PAYMENT",
      ref: p.reference?.trim() || p.method,
      detail: p.invoiceNumber
        ? `Payment (${p.method}) against ${p.invoiceNumber}`
        : `Payment (${p.method}) on account`,
      debit: 0,
      credit: p.amount,
    });
  }
  for (const c of creditNotes) {
    if (c.issuedAt < from) continue;
    entries.push({
      date: c.issuedAt,
      kind: "CREDIT_NOTE",
      ref: c.creditNoteNumber,
      detail: c.invoiceNumber ? `Credit note against ${c.invoiceNumber}` : "Credit note",
      debit: 0,
      credit: c.amount,
    });
  }
  entries.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.ref.localeCompare(b.ref),
  );

  let balance = opening;
  let totalDebits = 0;
  let totalCredits = 0;
  const rows: StatementRow[] = entries.map((e) => {
    balance = round2(balance + e.debit - e.credit);
    totalDebits += e.debit;
    totalCredits += e.credit;
    return { ...e, balance };
  });

  // Ageing uses each invoice's own pending amount (payments and credit
  // notes already allocated to it), as of the closing date.
  const ageing = agingSummary(
    invoices.map((i) => ({
      dueDate: i.dueDate,
      pending: round2(i.totalAmount - i.paidAmount - i.creditedAmount),
    })),
    to,
  );
  const overdue = round2(ageing.d0_30 + ageing.d31_60 + ageing.d61_90 + ageing.d90_plus);

  return {
    from,
    to,
    openingBalance: opening,
    rows,
    totalDebits: round2(totalDebits),
    totalCredits: round2(totalCredits),
    closingBalance: round2(balance),
    ageing,
    overdue,
  };
}

/** Default period: the last 12 months up to now. */
export function defaultStatementPeriod(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { from, to: now };
}
