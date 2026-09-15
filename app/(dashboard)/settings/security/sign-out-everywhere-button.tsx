"use client";

import { useState, useTransition } from "react";
import { signOutEverywhereAction } from "./actions";

// Confirmed action — types the person's own name to prove they
// meant it. Same pattern as revoke-device on admin/devices.

export function SignOutEverywhereButton({
  ownerName,
}: {
  ownerName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (typed.trim().toLowerCase() !== ownerName.trim().toLowerCase()) {
      setError(`Type "${ownerName}" to confirm.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await signOutEverywhereAction();
      // redirect() throws, so success never returns; only errors land here.
      if (res && "error" in res) setError(res.error);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800"
      >
        Sign out everywhere
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-xs text-red-800">
        End every session on every device — your phone, other browsers,
        and any other computer where you&apos;re signed in. Type your name to
        confirm.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={ownerName}
          className="w-52 rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Signing out…" : "Sign out everywhere"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setError(null);
          }}
          disabled={pending}
          className="rounded-md border border-border bg-white px-2 py-1 text-xs text-foreground"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
