"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, Field } from "../../../_components/ui";
import { updatePaymentMetaAction } from "../../actions";

export type PaymentMetaValues = {
  method: "CASH" | "CHEQUE" | "NEFT" | "RTGS" | "UPI" | "OTHER";
  reference: string;
  notes: string;
};

const METHODS: PaymentMetaValues["method"][] = [
  "CASH",
  "CHEQUE",
  "NEFT",
  "RTGS",
  "UPI",
  "OTHER",
];

export function PaymentMetaForm({
  paymentId,
  initial,
}: {
  paymentId: string;
  initial: PaymentMetaValues;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof PaymentMetaValues>(k: K, v: PaymentMetaValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updatePaymentMetaAction(paymentId, values);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <Field label="Method *">
        <select
          className={inputCls}
          value={values.method}
          onChange={(e) => set("method", e.target.value as PaymentMetaValues["method"])}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Reference (cheque no., UTR, UPI txn id)">
        <input
          className={inputCls}
          value={values.reference}
          onChange={(e) => set("reference", e.target.value)}
          maxLength={100}
        />
      </Field>

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
        Save changes
      </button>
    </form>
  );
}
