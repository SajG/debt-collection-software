"use client";

import { useState, useTransition } from "react";
import { recordOrderInvoiceAction } from "../../production/actions";

// Attach an invoice to a specific SalesOrder. Renders only for ADMIN
// and FACTORY (server action re-checks); the form disappears once
// SalesOrder.linkedInvoiceId is set.
export function RecordInvoiceForm({
  orderId,
  suggestedDueDate,
}: {
  orderId: string;
  suggestedDueDate?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(suggestedDueDate ?? today);
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordOrderInvoiceAction({
        orderId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate,
        totalAmount,
        notes: notes.trim() || undefined,
      });
      if ("error" in res) {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Record the printed invoice against this order. Party outstanding
        is updated automatically. Reuses the standard Invoice model —
        no parallel record is created.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Invoice #
          </span>
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            placeholder="SB/25-26/0142"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Invoice date
          </span>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Due date
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Total (₹)
          </span>
          <input
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            placeholder="87500"
            inputMode="decimal"
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes (optional)
        </span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      </label>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            invoiceNumber.trim().length === 0 ||
            totalAmount.trim().length === 0
          }
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record invoice"}
        </button>
      </div>
    </div>
  );
}
