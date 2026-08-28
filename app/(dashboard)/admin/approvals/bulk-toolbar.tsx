"use client";

import { useState, useTransition } from "react";
import {
  bulkApproveOrdersAction,
  bulkRejectOrdersAction,
} from "../../production/actions";

// Sticky toolbar that appears when any row is selected. One confirm,
// one server round-trip, optimistic list update via router.refresh
// after the batch returns.
//
// The `selectedIds` are read from the SelectionContext provider that
// wraps the whole approvals list; that context also owns the "clear
// selection" callback used after a successful batch.

export function BulkToolbar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (selectedIds.length === 0) return null;

  function approve() {
    if (
      !window.confirm(
        `Approve ${selectedIds.length} selected order${selectedIds.length === 1 ? "" : "s"}? Each salesperson gets a push.`,
      )
    ) {
      return;
    }
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await bulkApproveOrdersAction({
        orderIds: selectedIds,
        note: note.trim() || undefined,
      });
      report(res, "approved");
    });
  }
  function reject() {
    if (reason.trim().length === 0) {
      setError("Rejection reason required for bulk reject.");
      return;
    }
    if (
      !window.confirm(
        `Reject ${selectedIds.length} selected order${selectedIds.length === 1 ? "" : "s"} with reason "${reason.trim()}"?`,
      )
    ) {
      return;
    }
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await bulkRejectOrdersAction({
        orderIds: selectedIds,
        reason: reason.trim(),
      });
      report(res, "rejected");
    });
  }

  function report(
    res: { ok: string[]; failed: { id: string; error: string }[] },
    verb: string,
  ) {
    if (res.failed.length === 0) {
      setMsg(`${res.ok.length} order${res.ok.length === 1 ? "" : "s"} ${verb}.`);
      setReason("");
      setNote("");
      onDone();
      return;
    }
    setError(
      `${res.ok.length} ${verb}, ${res.failed.length} failed. First: ${res.failed[0].error}`,
    );
    // Partial success: still clear the selected-and-succeeded so the
    // list shrinks by the ones that went through.
    onDone();
  }

  return (
    <div className="sticky top-0 z-20 mb-4 rounded-xl border border-primary/40 bg-primary/5 p-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground">
          {selectedIds.length} selected
        </span>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Approval note (optional)"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "…" : `Approve ${selectedIds.length}`}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (required)"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={reject}
            disabled={pending || reason.trim().length === 0}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "…" : `Reject ${selectedIds.length}`}
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      ) : msg ? (
        <p className="mt-2 text-xs text-emerald-700">{msg}</p>
      ) : null}
    </div>
  );
}
