// Days Sales Outstanding — pure arithmetic for the public calculator.

export type DsoInput = {
  /** Trade receivables at the end of the period. */
  receivables: number;
  /** Credit sales in the period (not cash sales). */
  creditSales: number;
  /** Length of the period in days: 30, 90, 365… */
  periodDays: number;
  /** Your standard credit terms, in days. */
  termsDays: number;
  /** Annual cost of working capital, per cent (overdraft rate). */
  financeRatePct: number;
};

export type DsoResult = {
  dso: number;
  /** DSO minus terms; negative means customers pay early. */
  daysBeyondTerms: number;
  salesPerDay: number;
  /** Receivables you would not be carrying if everyone paid on terms. */
  cashTiedUp: number;
  /** What financing that cash costs per year. */
  annualFinanceCost: number;
  /** Cash released by bringing DSO down by one day. */
  perDay: number;
};

export function calculateDso(i: DsoInput): DsoResult | null {
  if (!(i.creditSales > 0) || !(i.periodDays > 0) || !(i.receivables >= 0)) return null;
  const salesPerDay = i.creditSales / i.periodDays;
  const dso = i.receivables / salesPerDay;
  const daysBeyondTerms = dso - Math.max(0, i.termsDays || 0);
  const cashTiedUp = Math.max(0, daysBeyondTerms) * salesPerDay;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    dso: round1(dso),
    daysBeyondTerms: round1(daysBeyondTerms),
    salesPerDay: Math.round(salesPerDay),
    cashTiedUp: Math.round(cashTiedUp),
    annualFinanceCost: Math.round((cashTiedUp * Math.max(0, i.financeRatePct || 0)) / 100),
    perDay: Math.round(salesPerDay),
  };
}
