"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocumentType, OrderStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";
import {
  NEXT_STATUS_ACTION_LABELS,
  DOCUMENT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
} from "@/lib/orders/status";
import { btnPrimaryCls, btnSecondaryCls, inputCls } from "../_components/ui";
import {
  advanceOrderStatusAction,
  uploadOrderDocumentAction,
} from "./actions";

export function AdvanceStatusButton({
  orderId,
  currentStatus,
  nextStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  nextStatus: OrderStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label =
    NEXT_STATUS_ACTION_LABELS[currentStatus] ??
    `Advance to ${ORDER_STATUS_LABELS[nextStatus]}`;

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await advanceOrderStatusAction(orderId, nextStatus, notes);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setNotes("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={`${btnPrimaryCls} min-h-16 w-full text-lg sm:text-xl px-6 py-4`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="advance-status-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2
              id="advance-status-title"
              className="text-xl font-semibold text-foreground"
            >
              Confirm status change
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              Move this order from{" "}
              <span className="font-medium text-foreground">
                {ORDER_STATUS_LABELS[currentStatus]}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {ORDER_STATUS_LABELS[nextStatus]}
              </span>
              ?
            </p>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Note (optional)
              </span>
              <textarea
                className={`${inputCls} min-h-24 text-base`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Packed 48 cartons, waiting for transporter"
                maxLength={1000}
              />
            </label>

            {error && (
              <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={`${btnSecondaryCls} min-h-12 px-5 text-base`}
                disabled={isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${btnPrimaryCls} min-h-12 px-5 text-base`}
                disabled={isPending}
                onClick={confirm}
              >
                {isPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Saving…
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DocumentUploadForm({
  orderId,
  allowedTypes,
}: {
  orderId: string;
  /** If set, restricts the type dropdown; server also enforces. */
  allowedTypes?: DocumentType[];
}) {
  const router = useRouter();
  const types =
    allowedTypes ?? (Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]);
  const [type, setType] = useState<DocumentType>(types[0]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    fd.set("orderId", orderId);
    fd.set("type", type);

    startTransition(async () => {
      const result = await uploadOrderDocumentAction(fd);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOk("Document uploaded.");
      e.currentTarget.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          Document type
        </span>
        <select
          className={`${inputCls} min-h-12 text-base`}
          value={type}
          onChange={(e) => setType(e.target.value as DocumentType)}
        >
          {types.map((key) => (
            <option key={key} value={key}>
              {DOCUMENT_TYPE_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          File (PDF or image)
        </span>
        <input
          name="file"
          type="file"
          required
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className={`${inputCls} min-h-12 py-3 text-base file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground`}
        />
      </label>

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      {ok && <p className="text-sm font-medium text-emerald-700">{ok}</p>}

      <button
        type="submit"
        disabled={isPending}
        className={`${btnPrimaryCls} min-h-14 w-full text-base sm:w-auto`}
      >
        {isPending ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Uploading…
          </>
        ) : (
          "Upload document"
        )}
      </button>
    </form>
  );
}
