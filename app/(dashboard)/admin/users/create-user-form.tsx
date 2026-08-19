"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { createUserAction } from "./actions";

export function CreateUserForm() {
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await createUserAction({ ownerName, phone, role });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setMsg(
        `Created ${ownerName} (${role}). Tell them to sign in with +91${phone}.`,
      );
      setOwnerName("");
      setPhone("");
      setRole("STAFF");
    });
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Name
          </span>
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="Ravi Kumar"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Phone (10 digits)
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            placeholder="9876543210"
            inputMode="tel"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Role
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="STAFF">STAFF (salesperson)</option>
            <option value="FACTORY">FACTORY (dispatch team)</option>
            <option value="ADMIN">ADMIN (full access)</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !ownerName.trim() || phone.length !== 10}
            className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Creating…" : "Add user"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Creates a Supabase auth user (phone_confirm: true), then the
        Profile row, then a CREATED audit-log entry. If the Profile
        insert fails the auth user is rolled back so no orphan can log
        in with no profile.
      </p>
    </div>
  );
}
