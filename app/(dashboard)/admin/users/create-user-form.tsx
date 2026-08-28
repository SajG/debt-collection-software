"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { createUserAction } from "./actions";

export function CreateUserForm() {
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const emailValid = /.+@.+\..+/.test(email.trim());
  const canSubmit =
    !pending && ownerName.trim().length > 0 && phone.length === 10 && emailValid;

  function submit() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await createUserAction({
        ownerName,
        phone,
        email: email.trim().toLowerCase(),
        role,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setMsg(
        `Created ${ownerName} (${role}). Invite emailed to ${email.trim().toLowerCase()}.`,
      );
      setOwnerName("");
      setPhone("");
      setEmail("");
      setRole("STAFF");
    });
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-5">
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
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            placeholder="9876543210"
            inputMode="tel"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Email
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="ravi@company.com"
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
            disabled={!canSubmit}
            className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Creating…" : "Add + invite"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Creates a Supabase auth user (phone + email), inserts the Profile
        row, writes a CREATED audit entry, and fires an invite email so
        the user can set a password and sign in on web. Rejects emails
        ending in .local, .test, .invalid, or .internal.
      </p>
    </div>
  );
}
