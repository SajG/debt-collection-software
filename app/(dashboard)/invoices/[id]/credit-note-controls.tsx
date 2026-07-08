"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { btnPrimaryCls, btnSecondaryCls, inputCls, Field } from "../../_components/ui";
import {
  issueCreditNoteAction,
  cancelCreditNoteAction,
} from "../credit-note-actions";

export function IssueCreditNoteForm({
  invoiceId,
  pending,
}: {
  invoiceId: string;
  pending: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className={btnSecondaryCls} onClick={() => setOpen(true)}>
        <Plus size={16} /> Issue credit note
      </button>
    );
  }

  return (
    <form
      className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await issueCreditNoteAction({ invoiceId, amount, reason });
          if ("error" in result) setError(result.error);
          else {
            setOpen(false);
            setAmount("");
            setReason("");
          }
        });
      }}
    >
      <Field label={`Credit amount (pending: ₹${pending})`}>
        <input
          className={inputCls}
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>
      <Field label="Reason (returns, discount, adjustment…)">
        <input
          className={inputCls}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={500}
          required
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className={btnPrimaryCls} disabled={isPending}>
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Issue credit
        </button>
        <button
          type="button"
          className={btnSecondaryCls}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CancelCreditNoteButton({ creditNoteId }: { creditNoteId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Cancel this credit note? The invoice balance will increase again.")) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await cancelCreditNoteAction(creditNoteId);
            if ("error" in result) setError(result.error);
          });
        }}
      >
        {isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
        Cancel
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
