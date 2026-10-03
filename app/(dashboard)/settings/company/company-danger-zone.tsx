"use client";

import { useState, useTransition } from "react";
import { cancelCompanyDeletionAction, deleteCompanyAction } from "./actions";

export function DeleteCompanyForm({ companyName }: { companyName: string }) {
  const [confirmName, setConfirmName] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = confirmName.trim() === companyName.trim();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        startTransition(async () => {
          const res = await deleteCompanyAction({ confirmName });
          setResult("error" in res ? { ok: false, text: res.error } : { ok: true, text: res.message });
        });
      }}
    >
      <label className="block text-sm">
        Type <strong>{companyName}</strong> to confirm
        <input
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          autoComplete="off"
        />
      </label>
      {result && (
        <p className={result.ok ? "text-sm text-foreground" : "text-sm text-red-600"}>{result.text}</p>
      )}
      <button
        type="submit"
        disabled={!ready || pending}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Scheduling…" : "Delete company"}
      </button>
    </form>
  );
}

export function CancelDeletionButton() {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await cancelCompanyDeletionAction();
            setResult("error" in res ? { ok: false, text: res.error } : { ok: true, text: res.message });
          })
        }
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Cancelling…" : "Cancel deletion"}
      </button>
      {result && (
        <p className={result.ok ? "text-sm text-foreground" : "text-sm text-red-600"}>{result.text}</p>
      )}
    </div>
  );
}
