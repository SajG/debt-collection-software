"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import {
  deactivateUserAction,
  reactivateUserAction,
  changeRoleAction,
  inviteUserAction,
  resendInviteAction,
  setUserEmailAction,
  makeOwnerAction,
} from "./actions";

// Client-side action buttons + confirmations, one row's worth. Kept
// tiny — no state library, plain window.confirm for the yes/no gate
// (the destructive verbs name the person, per spec).
//
// SY-email: web + mobile sign-in is emailed 6-digit codes only. A
// user with no email cannot sign in at ALL, so the row exposes an
// inline "Add email" input (EmailCell) and pairs it with a
// Send / Resend invite button so the admin can complete the flow
// without leaving the row.

export function UserRowActions({
  profile,
  isSelf = false,
  canMakeOwner = false,
}: {
  profile: {
    id: string;
    ownerName: string;
    role: Role;
    isActive: boolean;
    email?: string | null;
    invitedAt?: Date | null;
  };
  /** True when this row is the currently-signed-in admin. Suppresses
   *  role change + deactivate (the guard trigger would refuse anyway).
   *  Send invite still shows so an admin can email themselves a fresh
   *  sign-in code for mobile. */
  isSelf?: boolean;
  /** SY35 — viewer is the owner and this row is another active ADMIN. */
  canMakeOwner?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasInvitedBefore = !!profile.invitedAt;

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

  function runSendInvite() {
    if (!profile.email) {
      setError("This user has no email on file.");
      return;
    }
    const verb = hasInvitedBefore ? "Resend" : "Send";
    if (
      !window.confirm(
        `${verb} the sign-in invite to ${profile.email}?`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = hasInvitedBefore
        ? await resendInviteAction({ profileId: profile.id })
        : await inviteUserAction({ profileId: profile.id });
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

  function runMakeOwner() {
    if (
      !window.confirm(
        `Make ${profile.ownerName} the owner? They will manage billing and can delete the company. You stay an admin.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await makeOwnerAction({ profileId: profile.id });
      if ("error" in res) setError(res.error);
    });
  }

  const inviteLabel = hasInvitedBefore ? "Resend invite" : "Send invite";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {isSelf ? (
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
            {profile.email ? (
              <button
                type="button"
                onClick={runSendInvite}
                disabled={pending}
                className="rounded border border-sky-400 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 disabled:opacity-60"
                title={`Email a 6-digit sign-in code to ${profile.email}`}
              >
                {inviteLabel}
              </button>
            ) : null}
            {canMakeOwner && profile.role === "ADMIN" ? (
              <button
                type="button"
                onClick={runMakeOwner}
                disabled={pending}
                className="rounded border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground disabled:opacity-60"
              >
                Make owner
              </button>
            ) : null}
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
    </div>
  );
}

// Inline editable email cell. Rendered from page.tsx per row.
//
//   * No email yet → an input + "Add" button. Empty submit is a no-op.
//   * Email set    → shows the address plus an "Edit" toggle so a typo
//     can be fixed without going through the SQL editor.
export function EmailCell({
  profileId,
  email,
  isActive,
}: {
  profileId: string;
  email: string | null;
  isActive: boolean;
}) {
  const [editing, setEditing] = useState(!email);
  const [value, setValue] = useState(email ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const clean = value.trim().toLowerCase();
    if (!clean) {
      setError("Enter an email address.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await setUserEmailAction({
        profileId,
        email: clean,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  if (!editing && email) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{email}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          disabled={!isActive}
          title={
            isActive
              ? "Change this email"
              : "Reactivate the user before changing their email"
          }
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={email ? email : "name@example.com"}
          className="w-56 rounded border border-border bg-background px-2 py-1 text-xs"
          disabled={pending || !isActive}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !isActive}
          className="rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-60"
        >
          {email ? "Save" : "Add email"}
        </button>
        {email ? (
          <button
            type="button"
            onClick={() => {
              setValue(email);
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
