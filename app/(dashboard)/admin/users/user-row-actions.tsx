"use client";

import { useEffect, useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import {
  deactivateUserAction,
  reactivateUserAction,
  changeRoleAction,
  issueEnrollmentCodeAction,
} from "./actions";

// Client-side action buttons + confirmations, one row's worth. Kept
// tiny — no state library, plain window.confirm for the yes/no gate
// (the destructive verbs name the person, per spec).

export function UserRowActions({
  profile,
  isSelf = false,
}: {
  profile: {
    id: string;
    ownerName: string;
    role: Role;
    isActive: boolean;
  };
  /** True when this row is the currently-signed-in admin. Suppresses
   *  role change + deactivate (the guard trigger would refuse anyway)
   *  but keeps "Issue code" so the admin can enrol their own mobile. */
  isSelf?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    code: string;
    expiresAt: number;
  } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (!issued) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [issued]);

  const secondsLeft = issued
    ? Math.max(0, Math.floor((issued.expiresAt - nowTick) / 1000))
    : 0;

  function runIssueCode() {
    if (
      !window.confirm(
        `Issue an enrollment code for ${profile.ownerName}? Any live code is invalidated. The new code shows once and cannot be recovered.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await issueEnrollmentCodeAction({ profileId: profile.id });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setIssued({
        code: res.code,
        expiresAt: new Date(res.expiresAt).getTime(),
      });
    });
  }

  function copyCode() {
    if (!issued) return;
    void navigator.clipboard.writeText(issued.code).catch(() => undefined);
  }

  function runDeactivate() {
    if (
      !window.confirm(
        `Deactivate ${profile.ownerName}? They will be locked out immediately. Data is not deleted.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deactivateUserAction({ profileId: profile.id });
      if ("error" in res) setError(res.error);
    });
  }

  function runReactivate() {
    setError(null);
    startTransition(async () => {
      const res = await reactivateUserAction({ profileId: profile.id });
      if ("error" in res) setError(res.error);
    });
  }

  function runRoleChange(newRole: Role) {
    if (newRole === profile.role) return;
    const warn =
      newRole === "ADMIN"
        ? `Grant ADMIN to ${profile.ownerName}? Admins can create users, deactivate anyone (except themselves), and change roles.`
        : `Change ${profile.ownerName}'s role from ${profile.role} to ${newRole}?`;
    if (!window.confirm(warn)) return;
    setError(null);
    startTransition(async () => {
      const res = await changeRoleAction({
        profileId: profile.id,
        role: newRole,
      });
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {isSelf ? (
          // No role dropdown / no deactivate for your own row — the
          // guard trigger refuses either operation anyway, and a
          // stray click here would just error. Issue code stays so
          // an admin can enrol their own mobile.
          <span
            className="rounded border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
            title="You cannot change your own role or deactivate yourself. Ask another admin."
          >
            {profile.role}
          </span>
        ) : (
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs"
            defaultValue={profile.role}
            disabled={pending || !profile.isActive}
            onChange={(e) => runRoleChange(e.target.value as Role)}
          >
            <option value="ADMIN">ADMIN</option>
            <option value="STAFF">STAFF</option>
            <option value="FACTORY">FACTORY</option>
          </select>
        )}
        {profile.isActive ? (
          <>
            <button
              type="button"
              onClick={runIssueCode}
              disabled={pending}
              className="rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-60"
              title="Generate a one-time enrollment code so the user can register their device"
            >
              Issue code
            </button>
            {isSelf ? null : (
              <button
                type="button"
                onClick={runDeactivate}
                disabled={pending}
                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
              >
                Deactivate
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={runReactivate}
            disabled={pending}
            className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
          >
            Reactivate
          </button>
        )}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {issued ? (
        <div className="mt-1 rounded border border-emerald-400 bg-emerald-50 p-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900">
            Enrollment code · shows once
          </div>
          <div className="mt-1 flex items-center justify-end gap-2">
            <code className="font-mono text-base font-bold tracking-widest text-emerald-900">
              {issued.code}
            </code>
            <button
              type="button"
              onClick={copyCode}
              className="rounded border border-emerald-500 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setIssued(null)}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700"
              title="Hide the code"
            >
              Done
            </button>
          </div>
          <div className="mt-1 text-[10px] text-emerald-800">
            Expires in {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")}. Read it out —
            never send it in writing.
          </div>
        </div>
      ) : null}
    </div>
  );
}
