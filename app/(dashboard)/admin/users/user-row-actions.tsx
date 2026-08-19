"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import {
  deactivateUserAction,
  reactivateUserAction,
  changeRoleAction,
} from "./actions";

// Client-side action buttons + confirmations, one row's worth. Kept
// tiny — no state library, plain window.confirm for the yes/no gate
// (the destructive verbs name the person, per spec).

export function UserRowActions({
  profile,
}: {
  profile: {
    id: string;
    ownerName: string;
    role: Role;
    isActive: boolean;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        {profile.isActive ? (
          <button
            type="button"
            onClick={runDeactivate}
            disabled={pending}
            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
          >
            Deactivate
          </button>
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
    </div>
  );
}
