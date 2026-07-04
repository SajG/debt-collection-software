"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, Field } from "../_components/ui";
import { createInvoiceAction, updateInvoiceAction } from "./actions";

export type InvoiceFormValues = {
  partyId: string;
  invoiceNumber: string;
  invoiceDate: string; // yyyy-MM-dd
  dueDate: string;
  totalAmount: string;
  notes: string;
};

export function InvoiceForm({
  invoiceId,
  initial,
  parties,
}: {
  invoiceId?: string;
  initial?: Partial<InvoiceFormValues>;
  /** Omitted in edit mode — the party of an invoice cannot change. */
  parties?: { id: string; name: string }[];
}) {
  const [values, setValues] = useState<InvoiceFormValues>({
    partyId: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    totalAmount: "",
    notes: "",
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof InvoiceFormValues>(k: K, v: InvoiceFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = invoiceId
        ? await updateInvoiceAction(invoiceId, values)
        : await createInvoiceAction(values);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      {parties && (
        <Field label="Party *">
          <select
            className={inputCls}
            value={values.partyId}
            onChange={(e) => set("partyId", e.target.value)}
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
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Invoice number *">
          <input
            className={inputCls}
            value={values.invoiceNumber}
            onChange={(e) => set("invoiceNumber", e.target.value)}
            required
            maxLength={50}
          />
        </Field>
        <Field label="Total amount (₹) *">
          <input
            className={inputCls}
            type="number"
            min="0.01"
            step="0.01"
            value={values.totalAmount}
            onChange={(e) => set("totalAmount", e.target.value)}
            required
          />
        </Field>
        <Field label="Invoice date *">
          <input
            className={inputCls}
            type="date"
            value={values.invoiceDate}
            onChange={(e) => set("invoiceDate", e.target.value)}
            required
          />
        </Field>
        <Field label="Due date *">
          <input
            className={inputCls}
            type="date"
            value={values.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
            required
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
        {invoiceId ? "Save changes" : "Add invoice"}
      </button>
    </form>
  );
}
