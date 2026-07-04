"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, Field } from "../_components/ui";
import { createPaymentAction } from "./actions";

export type OpenInvoiceOption = {
  id: string;
  invoiceNumber: string;
  pending: string;
};

export function PaymentForm({
  parties,
  partyId,
  openInvoices,
  invoiceId,
}: {
  parties: { id: string; name: string }[];
  /** When set, the party is fixed and `openInvoices` holds their open invoices. */
  partyId?: string;
  openInvoices?: OpenInvoiceOption[];
  invoiceId?: string;
}) {
  const [values, setValues] = useState({
    partyId: partyId ?? "",
    invoiceId: invoiceId ?? "",
    amount: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    method: "NEFT",
    reference: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof typeof values>(k: K, v: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function handlePartyChange(newPartyId: string) {
    // Invoice options are rendered server-side for the fixed party; a party
    // change needs a reload with the new partyId in the URL.
    if (newPartyId) {
      window.location.href = `/payments/new?partyId=${newPartyId}`;
    } else {
      set("partyId", "");
      set("invoiceId", "");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPaymentAction({
        ...values,
        method: values.method as "CASH" | "CHEQUE" | "NEFT" | "RTGS" | "UPI" | "OTHER",
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <Field label="Party *">
        <select
          className={inputCls}
          value={values.partyId}
          onChange={(e) => handlePartyChange(e.target.value)}
          required
        >
          <option value="">Select party…</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {partyId && (
        <Field label="Against invoice">
          <select
            className={inputCls}
            value={values.invoiceId}
            onChange={(e) => set("invoiceId", e.target.value)}
          >
            <option value="">On account (no specific invoice)</option>
            {(openInvoices ?? []).map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} — ₹{inv.pending} pending
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount (₹) *">
          <input
            className={inputCls}
            type="number"
            min="0.01"
            step="0.01"
            value={values.amount}
            onChange={(e) => set("amount", e.target.value)}
            required
          />
        </Field>
        <Field label="Payment date *">
          <input
            className={inputCls}
            type="date"
            value={values.paymentDate}
            onChange={(e) => set("paymentDate", e.target.value)}
            required
          />
        </Field>
        <Field label="Method *">
          <select
            className={inputCls}
            value={values.method}
            onChange={(e) => set("method", e.target.value)}
          >
            <option value="NEFT">NEFT</option>
            <option value="RTGS">RTGS</option>
            <option value="UPI">UPI</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CASH">Cash</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Reference (UTR / cheque no.)">
          <input
            className={inputCls}
            value={values.reference}
            onChange={(e) => set("reference", e.target.value)}
            maxLength={100}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className={inputCls}
          rows={2}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={1000}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={btnPrimaryCls}>
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Record payment
      </button>
    </form>
  );
}
