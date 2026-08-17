"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimaryCls, inputCls, Field } from "../../_components/ui";
import { uploadPaymentDocumentAction } from "../documents-actions";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "BANK_SCREENSHOT", label: "Bank screenshot" },
  { value: "UPI_SCREENSHOT", label: "UPI screenshot" },
  { value: "CHEQUE_PHOTO", label: "Cheque photo" },
  { value: "RECEIPT", label: "Signed receipt" },
  { value: "OTHER", label: "Other" },
];

export function PaymentProofForm({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState("BANK_SCREENSHOT");
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await uploadPaymentDocumentAction(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setNotes("");
      setFileName("");
      formRef.current?.reset();
      setType("BANK_SCREENSHOT");
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <input type="hidden" name="paymentId" value={paymentId} />

      <Field label="Proof type">
        <select
          name="type"
          className={inputCls}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Photo or PDF">
        {/* capture="environment" opens the rear camera directly on mobile —
            salesperson can snap the payment screen and upload in one flow. */}
        <input
          type="file"
          name="file"
          accept="image/*,application/pdf"
          capture="environment"
          className={`${inputCls} py-2 file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-primary`}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          required
        />
        {fileName && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {fileName}
          </p>
        )}
      </Field>

      <Field label="Notes (optional)">
        <input
          type="text"
          name="notes"
          className={inputCls}
          placeholder="UTR / cheque number / any reference"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        className={`${btnPrimaryCls} w-full min-h-11`}
        disabled={isPending}
      >
        {isPending ? "Uploading…" : "Upload proof"}
      </button>
    </form>
  );
}
