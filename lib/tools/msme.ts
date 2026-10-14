// Section 43B(h) of the Income-tax Act read with section 15 of the
// MSMED Act, 2006 — pure date arithmetic for the public calculator.
// Not tax advice; the page says so.
//
//   time limit = the agreed credit period when there is a written
//                agreement, capped at 45 days; otherwise 15 days
//   counted from the day of acceptance (delivery) of goods/services
//   a purchase is disallowed in the year it was booked only if it is
//   paid after its time limit AND is still unpaid at that year's end
//   (31 March); it is then deductible in the year of payment.

const DAY = 24 * 60 * 60 * 1000;

export type MsmeInput = {
  /** Day the goods or services were accepted (delivered). yyyy-mm-dd */
  acceptanceDate: string;
  hasWrittenAgreement: boolean;
  /** Credit days in the agreement. Ignored without one. */
  agreedDays: number;
  amount: number;
  /** yyyy-mm-dd, or null when not yet paid. */
  paymentDate: string | null;
  /** Buyer's income-tax rate, per cent (e.g. 25, 30). */
  taxRatePct: number;
  /** "Today", for unpaid invoices. yyyy-mm-dd */
  today: string;
};

export type MsmeResult = {
  limitDays: number;
  /** True when the agreed period was longer than 45 days and was cut. */
  capped: boolean;
  dueDate: string;
  /** Financial year the purchase belongs to, e.g. "2026-27". */
  financialYear: string;
  yearEnd: string;
  status: "paid_on_time" | "paid_late_same_year" | "paid_after_year_end" | "unpaid_not_yet_due" | "unpaid_overdue";
  /** Days past the limit: at payment if paid, else as of today. 0 when on time. */
  daysLate: number;
  /** Amount not deductible in the year of purchase. */
  disallowedThisYear: number;
  /** Tax paid a year early because of the disallowance. */
  estimatedTax: number;
  /** For an unpaid, overdue invoice: pay by this date to keep the deduction. */
  payByToAvoid: string | null;
};

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function msmeDueDate(input: MsmeInput): MsmeResult {
  const accepted = parse(input.acceptanceDate);
  const agreed = Math.max(0, Math.floor(input.agreedDays || 0));
  const limitDays = input.hasWrittenAgreement ? Math.min(agreed, 45) : 15;
  const capped = input.hasWrittenAgreement && agreed > 45;
  const due = new Date(accepted.getTime() + limitDays * DAY);

  // Indian financial year: 1 April – 31 March.
  const fyStart = accepted.getUTCMonth() >= 3 ? accepted.getUTCFullYear() : accepted.getUTCFullYear() - 1;
  const yearEnd = new Date(Date.UTC(fyStart + 1, 2, 31));
  const financialYear = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;

  const paid = input.paymentDate ? parse(input.paymentDate) : null;
  const today = parse(input.today);
  const lateBy = (d: Date) => Math.max(0, Math.round((d.getTime() - due.getTime()) / DAY));

  let status: MsmeResult["status"];
  let daysLate = 0;
  let disallowed = 0;
  let payByToAvoid: string | null = null;

  if (paid) {
    daysLate = lateBy(paid);
    if (daysLate === 0) status = "paid_on_time";
    else if (paid <= yearEnd) status = "paid_late_same_year";
    else {
      status = "paid_after_year_end";
      disallowed = input.amount;
    }
  } else {
    daysLate = lateBy(today);
    if (daysLate === 0) {
      status = "unpaid_not_yet_due";
      payByToAvoid = fmt(due);
    } else {
      status = "unpaid_overdue";
      // Already late: the deduction survives only if paid by year-end.
      if (today <= yearEnd) payByToAvoid = fmt(yearEnd);
      disallowed = input.amount;
    }
  }

  const amount = Math.max(0, input.amount || 0);
  disallowed = disallowed ? amount : 0;
  return {
    limitDays,
    capped,
    dueDate: fmt(due),
    financialYear,
    yearEnd: fmt(yearEnd),
    status,
    daysLate,
    disallowedThisYear: disallowed,
    estimatedTax: Math.round((disallowed * Math.max(0, input.taxRatePct || 0)) / 100),
    payByToAvoid,
  };
}
