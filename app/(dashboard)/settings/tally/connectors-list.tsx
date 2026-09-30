"use client";

import { useTransition, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { revokeConnectorAction } from "./actions";

type Row = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastErrorFriendly: string | null;
  rowsSyncedTotal: number;
  revokedAt: string | null;
};

// SY27 — client row list. Server component below hydrates rows and
// pre-computes the friendly error string so we don't ship the raw
// stack to the browser.

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function ConnectorsList({ rows }: { rows: Row[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        No PCs paired yet. Generate a code above and enter it in the
        connector on your Tally machine.
      </div>
    );
  }

  function revoke(id: string, name: string) {
    if (!window.confirm(`Revoke access for "${name}"? The next sync attempt from this PC will be refused.`)) {
      return;
    }
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const res = await revokeConnectorAction({ connectorId: id });
      if ("error" in res) setError(res.error);
      setPendingId(null);
    });
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 px-3">PC</th>
            <th className="py-2 px-3">Last sync</th>
            <th className="py-2 px-3">Rows synced</th>
            <th className="py-2 px-3">Last error</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.revokedAt ? "bg-slate-50/60" : "border-b"}>
              <td className="py-2 px-3">
                <div className="font-medium">{r.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  Last seen {timeAgo(r.lastSeenAt)}
                </div>
              </td>
              <td className="py-2 px-3 text-muted-foreground">
                {timeAgo(r.lastSyncAt)}
              </td>
              <td className="py-2 px-3 tabular-nums">
                {r.rowsSyncedTotal.toLocaleString("en-IN")}
              </td>
              <td className="py-2 px-3">
                {r.lastErrorFriendly ? (
                  <span className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-800">
                    {r.lastErrorFriendly}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-2 px-3">
                {r.revokedAt ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    Revoked
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Active
                  </span>
                )}
              </td>
              <td className="py-2 px-3 text-right">
                {!r.revokedAt && (
                  <button
                    type="button"
                    onClick={() => revoke(r.id, r.name)}
                    disabled={pendingId === r.id}
                    className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                  >
                    {pendingId === r.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <XCircle size={12} />
                    )}
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
