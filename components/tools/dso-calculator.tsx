"use client";

import { useMemo, useState } from "react";
import { calculateDso } from "@/lib/tools/dso";
import { Field, NumberInput, ResultRow, inr } from "./fields";
import { mkt } from "@/components/marketing/tokens";

export function DsoCalculator() {
  const [receivables, setReceivables] = useState("24000000");
  const [creditSales, setCreditSales] = useState("120000000");
  const [periodDays, setPeriodDays] = useState("365");
  const [termsDays, setTermsDays] = useState("45");
  const [rate, setRate] = useState("11");

  const r = useMemo(
    () =>
      calculateDso({
        receivables: Number(receivables) || 0,
        creditSales: Number(creditSales) || 0,
        periodDays: Number(periodDays) || 0,
        termsDays: Number(termsDays) || 0,
        financeRatePct: Number(rate) || 0,
      }),
    [receivables, creditSales, periodDays, termsDays, rate],
  );

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Receivables today (₹)" hint="Total customers owe you.">
        <NumberInput value={receivables} onChange={setReceivables} />
      </Field>
      <Field label="Credit sales in the period (₹)" hint="Leave out cash sales.">
        <NumberInput value={creditSales} onChange={setCreditSales} />
      </Field>
      <Field label="Period">
        <select
          value={periodDays}
          onChange={(e) => setPeriodDays(e.target.value)}
          className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-base"
          style={{ borderColor: mkt.border, color: mkt.ink }}
        >
          <option value="365">Last 12 months (365 days)</option>
          <option value="90">Last quarter (90 days)</option>
          <option value="30">Last month (30 days)</option>
        </select>
      </Field>
      <Field label="Your credit terms (days)">
        <NumberInput value={termsDays} onChange={setTermsDays} step={1} />
      </Field>
      <Field label="Cost of working capital (% a year)" hint="Your overdraft or CC rate.">
        <NumberInput value={rate} onChange={setRate} />
      </Field>

      <div className="sm:col-span-2" aria-live="polite">
        {r ? (
          <>
            <ResultRow label="Days sales outstanding (DSO)" value={`${r.dso} days`} strong />
            <ResultRow
              label="Compared with your terms"
              value={
                r.daysBeyondTerms > 0
                  ? `${r.daysBeyondTerms} days late on average`
                  : `${Math.abs(r.daysBeyondTerms)} days inside terms`
              }
            />
            <ResultRow label="Credit sales per day" value={inr(r.salesPerDay)} />
            <ResultRow label="Cash tied up beyond terms" value={inr(r.cashTiedUp)} strong />
            <ResultRow label="Cost of financing it, per year" value={inr(r.annualFinanceCost)} />
            <ResultRow label="Cash released for each day DSO falls" value={inr(r.perDay)} />
          </>
        ) : (
          <p className="text-base" style={{ color: mkt.ink2 }}>
            Enter receivables and credit sales to see your DSO.
          </p>
        )}
      </div>
    </div>
  );
}
