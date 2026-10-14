"use client";

import { useMemo, useState } from "react";
import { msmeDueDate } from "@/lib/tools/msme";
import { DateInput, Field, NumberInput, ResultRow, inr, longDate } from "./fields";
import { mkt } from "@/components/marketing/tokens";

const today = () => new Date().toISOString().slice(0, 10);

export function MsmeCalculator() {
  const [acceptanceDate, setAcceptanceDate] = useState(today());
  const [hasAgreement, setHasAgreement] = useState(true);
  const [agreedDays, setAgreedDays] = useState("45");
  const [amount, setAmount] = useState("500000");
  const [paid, setPaid] = useState(false);
  const [paymentDate, setPaymentDate] = useState(today());
  const [taxRate, setTaxRate] = useState("25");

  const r = useMemo(
    () =>
      acceptanceDate
        ? msmeDueDate({
            acceptanceDate,
            hasWrittenAgreement: hasAgreement,
            agreedDays: Number(agreedDays) || 0,
            amount: Number(amount) || 0,
            paymentDate: paid && paymentDate ? paymentDate : null,
            taxRatePct: Number(taxRate) || 0,
            today: today(),
          })
        : null,
    [acceptanceDate, hasAgreement, agreedDays, amount, paid, paymentDate, taxRate],
  );

  const verdict = !r
    ? null
    : {
        paid_on_time: { tone: mkt.teal, bg: mkt.tealLight, text: "Paid within the time limit. The purchase is deductible as usual." },
        paid_late_same_year: {
          tone: mkt.ink,
          bg: mkt.amberLight,
          text: `Paid ${r.daysLate} day${r.daysLate === 1 ? "" : "s"} late, but before 31 March — still deductible in FY ${r.financialYear}. Interest under the MSMED Act may apply.`,
        },
        paid_after_year_end: {
          tone: mkt.fault,
          bg: mkt.faultLight,
          text: `Paid late and after 31 March. Not deductible in FY ${r.financialYear}; deductible in the year it was paid.`,
        },
        unpaid_not_yet_due: {
          tone: mkt.teal,
          bg: mkt.tealLight,
          text: `Not yet late. Pay on or before ${longDate(r.dueDate)} and there is no disallowance.`,
        },
        unpaid_overdue: {
          tone: mkt.fault,
          bg: mkt.faultLight,
          text: r.payByToAvoid
            ? `${r.daysLate} day${r.daysLate === 1 ? "" : "s"} past the limit. Pay on or before ${longDate(r.payByToAvoid)} to keep the deduction in FY ${r.financialYear}.`
            : `Past the limit and past 31 March. Not deductible in FY ${r.financialYear}; it becomes deductible in the year you pay.`,
        },
      }[r.status];

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Date goods or services were accepted" hint="Usually the delivery date.">
        <DateInput value={acceptanceDate} onChange={setAcceptanceDate} />
      </Field>
      <Field label="Invoice amount (₹)">
        <NumberInput value={amount} onChange={setAmount} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold" style={{ color: mkt.ink }}>
          Is the credit period agreed in writing?
        </legend>
        <div className="mt-2 flex flex-wrap gap-4 text-base">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="agreement" checked={hasAgreement} onChange={() => setHasAgreement(true)} />
            Yes
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="agreement" checked={!hasAgreement} onChange={() => setHasAgreement(false)} />
            No (15 days apply)
          </label>
        </div>
      </fieldset>
      {hasAgreement ? (
        <Field label="Agreed credit days" hint="More than 45 is treated as 45.">
          <NumberInput value={agreedDays} onChange={setAgreedDays} step={1} />
        </Field>
      ) : null}
      <Field label="Buyer's tax rate (%)" hint="For the estimate only. 25, 30 or your slab.">
        <NumberInput value={taxRate} onChange={setTaxRate} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold" style={{ color: mkt.ink }}>
          Has it been paid?
        </legend>
        <div className="mt-2 flex flex-wrap gap-4 text-base">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="paid" checked={!paid} onChange={() => setPaid(false)} />
            Not yet
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="paid" checked={paid} onChange={() => setPaid(true)} />
            Yes
          </label>
        </div>
      </fieldset>
      {paid ? (
        <Field label="Payment date">
          <DateInput value={paymentDate} onChange={setPaymentDate} />
        </Field>
      ) : null}

      {r && verdict ? (
        <div className="sm:col-span-2" aria-live="polite">
          <ResultRow label="Time limit" value={`${r.limitDays} days${r.capped ? " (capped at 45)" : ""}`} />
          <ResultRow label="Pay on or before" value={longDate(r.dueDate)} strong />
          <ResultRow label="Financial year of the purchase" value={`FY ${r.financialYear}`} />
          <ResultRow label={`Disallowed in FY ${r.financialYear}`} value={inr(r.disallowedThisYear)} />
          <ResultRow label="Estimated tax paid a year early" value={inr(r.estimatedTax)} strong />
          <p className="mt-4 rounded-lg px-4 py-3 text-base font-semibold" style={{ backgroundColor: verdict.bg, color: verdict.tone }}>
            {verdict.text}
          </p>
        </div>
      ) : null}
    </div>
  );
}
