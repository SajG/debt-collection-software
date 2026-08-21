"use client";

import { useState, useTransition } from "react";
import {
  approveOrderAction,
  rejectOrderAction,
} from "../../production/actions";

export function ApprovalActions({ orderId }: { orderId: string }) {
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await approveOrderAction({
        orderId,
        note: note.trim() || undefined,
      });
      if ("error" in res) setError(res.error);
      else setMsg("Approved.");
    });
  }
  function reject() {
    setError(null);
    setMsg(null);
    if (reason.trim().length === 0) {
      setError("Rejection reason is required.");
      return;
    }
    if (
      !window.confirm(
        `Reject this order? The salesperson gets a push. Reason: "${reason.trim()}"`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await rejectOrderAction({ orderId, reason: reason.trim() });
      if ("error" in res) setError(res.error);
      else setMsg("Rejected.");
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-800">
          Approve
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          placeholder="Approval note (optional)"
        />
        <button
          type="button"
          onClick={approve}
          disabled={pending}
          className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "…" : "Approve"}
        </button>
      </div>
      <div className="rounded-md border border-red-200 bg-red-50/40 p-3">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-red-800">
          Reject (required reason)
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          placeholder="e.g. price too low / customer credit hold"
        />
        <button
          type="button"
          onClick={reject}
          disabled={pending || reason.trim().length === 0}
          className="w-full rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "…" : "Reject"}
        </button>
      </div>
      {error ? <p className="col-span-full text-xs text-red-600">{error}</p> : null}
      {msg ? <p className="col-span-full text-xs text-emerald-700">{msg}</p> : null}
    </div>
  );
}
