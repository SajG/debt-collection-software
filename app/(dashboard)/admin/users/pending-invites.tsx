"use client";

import { useState, useTransition } from "react";
import { resendInvitationAction, revokeInvitationAction } from "./actions";

export type PendingInvite = {
  id: string;
  email: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
  ownerName: string | null;
  state: "pending" | "expired" | "accepted" | "revoked";
  sentLabel: string;
  sendCount: number;
};

const ROLE_LABEL = { ADMIN: "Management", STAFF: "Sales", FACTORY: "Factory" } as const;

export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (invites.length === 0) return null;

  function run(fn: () => Promise<{ error?: string; emailed?: boolean } | { ok: true; emailed?: boolean }>) {
    setNote(null);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) setError(res.error);
      else setNote("Done.");
    });
  }

  return (
    <div className="rounded-lg border border-border/60">
      <div className="border-b border-border/60 bg-muted/30 px-4 py-2 text-sm font-semibold">
        Pending invitations ({invites.length})
      </div>
      <ul className="divide-y divide-border/60">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{i.ownerName ?? i.email}</div>
              {i.ownerName ? <div className="truncate text-xs text-muted-foreground">{i.email}</div> : null}
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
              {ROLE_LABEL[i.role]}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                i.state === "expired" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
              }`}
            >
              {i.state === "expired" ? "Expired" : "Invited"} · {i.sentLabel}
            </span>
            <button
              disabled={busy}
              onClick={() => run(() => resendInvitationAction({ invitationId: i.id }))}
              className="rounded-md border border-border px-2 py-1 text-xs font-semibold disabled:opacity-60"
            >
              Resend
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => revokeInvitationAction({ invitationId: i.id }))}
              className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="px-4 py-2 text-xs text-red-600">{error}</p> : null}
      {note ? <p className="px-4 py-2 text-xs text-emerald-700">{note}</p> : null}
    </div>
  );
}
