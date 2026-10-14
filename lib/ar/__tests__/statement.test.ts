import { describe, expect, it } from "vitest";
import { buildStatement } from "../statement";

const d = (s: string) => new Date(`${s}T00:00:00`);
const inv = (n: string, date: string, due: string, total: number, paid = 0, credited = 0, cancelled = false) => ({
  invoiceNumber: n, invoiceDate: d(date), dueDate: d(due), totalAmount: total, paidAmount: paid, creditedAmount: credited, cancelled,
});
const pay = (date: string, amount: number, invoiceNumber: string | null = null, reference: string | null = null) => ({
  paymentDate: d(date), amount, method: "NEFT", reference, invoiceNumber,
});
const cn = (n: string, date: string, amount: number, invoiceNumber: string | null, cancelled = false) => ({
  creditNoteNumber: n, issuedAt: d(date), amount, invoiceNumber, cancelled,
});

describe("statement of account", () => {
  const base = {
    invoices: [
      inv("A-1", "2026-05-10", "2026-06-09", 100000, 100000),
      inv("A-2", "2026-08-01", "2026-08-31", 50000, 20000, 5000),
      inv("A-3", "2026-09-20", "2026-10-20", 30000),
    ],
    payments: [pay("2026-06-05", 100000, "A-1", "UTR1"), pay("2026-09-01", 20000, "A-2")],
    creditNotes: [cn("CN-1", "2026-08-15", 5000, "A-2")],
    from: d("2026-07-01"),
    to: d("2026-10-07"),
  };

  it("rolls everything before the period into the opening balance", () => {
    const s = buildStatement(base);
    expect(s.openingBalance).toBe(0); // A-1 invoiced and fully paid before July
    expect(s.rows.map((r) => r.ref)).toEqual(["A-2", "CN-1", "NEFT", "A-3"]);
  });

  it("keeps a running balance and totals that reconcile", () => {
    const s = buildStatement(base);
    expect(s.rows.map((r) => r.balance)).toEqual([50000, 45000, 25000, 55000]);
    expect(s.totalDebits).toBe(80000);
    expect(s.totalCredits).toBe(25000);
    expect(s.closingBalance).toBe(s.openingBalance + s.totalDebits - s.totalCredits);
    expect(s.closingBalance).toBe(55000);
  });

  it("ages what is unpaid on the closing date", () => {
    const s = buildStatement(base);
    expect(s.ageing.current).toBe(30000); // A-3 not yet due
    expect(s.ageing.d31_60).toBe(25000); // A-2: 37 days past due, 25,000 left
    expect(s.overdue).toBe(25000);
  });

  it("carries an unpaid older invoice in the opening balance", () => {
    const s = buildStatement({ ...base, invoices: [inv("OLD", "2026-03-01", "2026-03-31", 12000), ...base.invoices] });
    expect(s.openingBalance).toBe(12000);
    expect(s.closingBalance).toBe(67000);
    expect(s.ageing.d90_plus).toBe(12000);
  });

  it("ignores cancelled invoices and cancelled credit notes, and anything after the closing date", () => {
    const s = buildStatement({
      ...base,
      invoices: [...base.invoices, inv("X", "2026-08-05", "2026-09-04", 99999, 0, 0, true), inv("LATER", "2026-11-01", "2026-12-01", 7000)],
      creditNotes: [...base.creditNotes, cn("CN-X", "2026-08-20", 4000, "A-2", true)],
      payments: [...base.payments, pay("2026-10-30", 1000)],
    });
    expect(s.closingBalance).toBe(55000);
    expect(s.rows.some((r) => ["X", "LATER", "CN-X"].includes(r.ref))).toBe(false);
  });

  it("an on-account payment can take the balance negative (customer in credit)", () => {
    const s = buildStatement({ invoices: [], payments: [pay("2026-09-01", 5000)], creditNotes: [], from: d("2026-07-01"), to: d("2026-10-07") });
    expect(s.closingBalance).toBe(-5000);
    expect(s.rows[0]!.detail).toMatch(/on account/);
  });

  it("orders same-day rows invoice → credit note → payment", () => {
    const s = buildStatement({
      invoices: [inv("S", "2026-09-01", "2026-09-30", 1000)],
      payments: [pay("2026-09-01", 400, "S")],
      creditNotes: [cn("CN-S", "2026-09-01", 100, "S")],
      from: d("2026-07-01"),
      to: d("2026-10-07"),
    });
    expect(s.rows.map((r) => r.kind)).toEqual(["INVOICE", "CREDIT_NOTE", "PAYMENT"]);
    expect(s.rows.map((r) => r.balance)).toEqual([1000, 900, 500]);
  });
});
