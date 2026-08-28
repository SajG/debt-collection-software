"use client";

import { useState, useTransition } from "react";
import { disableTotpAction } from "./actions";

export function DisableTotpButton({ factorId }: { factorId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (
      !window.confirm(
        "Disable TOTP? You will be signed out on your next request until you re-enrol. Admins cannot reach the dashboard without TOTP.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await disableTotpAction({ factorId });
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
      >
        {pending ? "Disabling…" : "Disable TOTP"}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
