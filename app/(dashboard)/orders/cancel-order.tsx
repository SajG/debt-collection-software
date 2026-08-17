"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnSecondaryCls, inputCls } from "../_components/ui";
import { cancelSalesOrderAction } from "./actions";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await cancelSalesOrderAction(orderId, reason);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={`${btnSecondaryCls} text-red-700`}
        onClick={() => setOpen(true)}
      >
        Cancel order
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">
              Cancel this order?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The factory will see the cancellation immediately. This can't be
              undone.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Reason
              </span>
              <textarea
                className={inputCls}
                rows={3}
                placeholder="Why is this being cancelled?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={btnSecondaryCls}
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Keep order
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                onClick={submit}
                disabled={isPending}
              >
                {isPending ? "Cancelling…" : "Cancel order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
