"use client";

import { useState, useTransition } from "react";
import { revokeDeviceAction } from "../users/actions";

// Type-the-name-to-confirm mirrors the deactivate pattern from admin/users.
// Revoking a device is destructive (owner is signed out globally) and the
// friction is deliberate.

export function DeviceRowActions({
  deviceId,
  ownerName,
  label,
}: {
  deviceId: string;
  ownerName: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (typed.trim().toLowerCase() !== ownerName.trim().toLowerCase()) {
      setError(`Type "${ownerName}" to confirm.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await revokeDeviceAction({ deviceId });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      setTyped("");
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
      >
        Revoke
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-xs text-red-800">
        Revoke <span className="font-semibold">{label}</span>? {ownerName} will
        be signed out everywhere. Type their name to confirm.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={ownerName}
          className="w-40 rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded border border-red-500 bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Revoking…" : "Revoke"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setError(null);
          }}
          disabled={pending}
          className="rounded border border-border bg-white px-2 py-1 text-xs text-foreground"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
