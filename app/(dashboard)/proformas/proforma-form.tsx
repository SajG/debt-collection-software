"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { inputCls, btnPrimaryCls, btnSecondaryCls, Field } from "../_components/ui";
import { createProformaAction, updateProformaAction } from "./actions";
import type { ProformaInput, ProformaLineItemInput } from "@/lib/validation";

export type ProformaFormValues = {
  partyId: string;
  issueDate: string; // yyyy-MM-dd
  validUntil: string;
  notes: string;
  termsConditions: string;
  lineItems: ProformaLineItemInput[];
};

const emptyLine: ProformaLineItemInput = {
  description: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
  taxRate: "18",
};

function lineTotals(li: ProformaLineItemInput) {
  const qty = Number(li.quantity) || 0;
  const price = Number(li.unitPrice) || 0;
  const rate = Number(li.taxRate) || 0;
  const base = Math.round(qty * price * 100) / 100;
  const tax = Math.round(base * rate) / 100;
  return { base, tax, total: base + tax };
}

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function ProformaForm({
  proformaId,
  initial,
  parties,
}: {
  proformaId?: string;
  initial?: Partial<ProformaFormValues>;
  /** Omitted in edit mode — the party of a proforma cannot change. */
  parties?: { id: string; name: string }[];
}) {
  const [values, setValues] = useState<ProformaFormValues>({
    partyId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    validUntil: "",
    notes: "",
    termsConditions: "",
    lineItems: [{ ...emptyLine }],
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof ProformaFormValues>(k: K, v: ProformaFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function setLine(i: number, patch: Partial<ProformaLineItemInput>) {
    setValues((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((li, idx) => (idx === i ? { ...li, ...patch } : li)),
    }));
  }

  const totals = values.lineItems.reduce(
    (acc, li) => {
      const t = lineTotals(li);
      return { base: acc.base + t.base, tax: acc.tax + t.tax, total: acc.total + t.total };
    },
    { base: 0, tax: 0, total: 0 }
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input: ProformaInput = values;
      const result = proformaId
        ? await updateProformaAction(proformaId, input)
        : await createProformaAction(input);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <Field label="Issue date *">
          <input
            className={inputCls}
            type="date"
            value={values.issueDate}
            onChange={(e) => set("issueDate", e.target.value)}
            required
          />
        </Field>
        <Field label="Valid until">
          <input
            className={inputCls}
            type="date"
            value={values.validUntil}
            onChange={(e) => set("validUntil", e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 min-w-[200px]">Description</th>
                <th className="px-3 py-2 w-24">Qty</th>
                <th className="px-3 py-2 w-20">Unit</th>
                <th className="px-3 py-2 w-32">Unit price (₹)</th>
                <th className="px-3 py-2 w-24">Tax %</th>
                <th className="px-3 py-2 w-28 text-right">Line total</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {values.lineItems.map((li, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={li.description}
                      onChange={(e) => setLine(i, { description: e.target.value })}
                      placeholder="Item or service"
                      required
                      maxLength={300}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      type="number"
                      min="0.001"
                      step="any"
                      value={li.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={li.unit ?? ""}
                      onChange={(e) => setLine(i, { unit: e.target.value })}
                      placeholder="pcs"
                      maxLength={20}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      type="number"
                      min="0"
                      step="0.01"
                      value={li.unitPrice}
                      onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={li.taxRate}
                      onChange={(e) => setLine(i, { taxRate: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap pt-4">
                    {inr(lineTotals(li).total)}
                  </td>
                  <td className="px-3 py-2 pt-3">
                    <button
                      type="button"
                      aria-label="Remove line"
                      className="text-muted-foreground hover:text-red-600 disabled:opacity-40"
                      disabled={values.lineItems.length === 1}
                      onClick={() =>
                        set(
                          "lineItems",
                          values.lineItems.filter((_, idx) => idx !== i)
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3">
          <button
            type="button"
            className={btnSecondaryCls}
            onClick={() => set("lineItems", [...values.lineItems, { ...emptyLine }])}
            disabled={values.lineItems.length >= 50}
          >
            <Plus size={16} /> Add line
          </button>
          <div className="space-y-1 text-right text-sm">
            <p className="text-muted-foreground">Subtotal: {inr(totals.base)}</p>
            <p className="text-muted-foreground">Tax: {inr(totals.tax)}</p>
            <p className="text-base font-semibold">Total: {inr(totals.total)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Notes">
          <textarea
            className={inputCls}
            rows={2}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            maxLength={1000}
          />
        </Field>
        <Field label="Terms & conditions">
          <textarea
            className={inputCls}
            rows={2}
            value={values.termsConditions}
            onChange={(e) => set("termsConditions", e.target.value)}
            maxLength={2000}
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={btnPrimaryCls}>
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {proformaId ? "Save changes" : "Create proforma"}
      </button>
    </form>
  );
}
