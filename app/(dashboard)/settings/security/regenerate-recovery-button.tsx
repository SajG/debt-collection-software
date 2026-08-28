"use client";

import { useState, useTransition } from "react";
import { regenerateRecoveryCodesAction } from "./actions";

export function RegenerateRecoveryButton() {
  const [pending, startTransition] = useTransition();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (
      !window.confirm(
        "Generating new codes invalidates the old ones. Continue?",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await regenerateRecoveryCodesAction();
      if ("error" in res) setError(res.error);
      else setCodes(res.recoveryCodes);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-emerald-500 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate new codes"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
      {codes ? (
        <div className="mt-3 rounded border border-emerald-400 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-900">
            Save these now — the previous set is invalid.
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((c) => (
              <li
                key={c}
                className="rounded bg-white px-2 py-1 text-center tracking-widest text-emerald-900"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
