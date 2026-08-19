"use client";

import { useState, useTransition } from "react";
import { approveOrderRateAction } from "../../production/actions";

export function ApproveRateButton({ orderId }: { orderId: string }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await approveOrderRateAction({
        orderId,
        note: note.trim() || undefined,
      });
      if ("error" in res) setError(res.error);
    });
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm sm:w-64"
        placeholder="Reason (optional)"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Approving…" : "Approve rate"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
