"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { inviteMemberAction } from "./actions";
import { ShareInviteLink } from "./share-invite-link";

// SY42 — email-first invite. No account is created until the invitee
// accepts the emailed link and chooses a password, so a pending invite
// never takes a seat. Phone is optional (shown to the team once joined).

export function CreateUserForm({ companyName }: { companyName?: string | null } = {}) {
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [share, setShare] = useState<{ joinUrl: string; phone: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const emailValid = /.+@.+\..+/.test(email.trim());
  const phoneValid = phone.length === 0 || phone.length === 10;
  const canSubmit = !pending && emailValid && phoneValid;

  function submit() {
    setError(null);
    setMsg(null);
    setShare(null);
    startTransition(async () => {
      const res = await inviteMemberAction({
        email: email.trim().toLowerCase(),
        role,
        ownerName: ownerName.trim() || undefined,
        phone: phone || undefined,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setMsg(
        res.emailed
          ? `Invitation emailed to ${res.email}.`
          : `Invitation created for ${res.email}, but the email could not be sent. Share the link below instead.`,
      );
      setShare({ joinUrl: res.joinUrl, phone: res.phone });
      setOwnerName("");
      setEmail("");
      setPhone("");
      setRole("STAFF");
    });
  }

  const label =
    "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const box = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <label className="text-sm sm:col-span-2">
          <span className={label}>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="off"
            className={box}
            placeholder="ravi@company.com"
          />
        </label>
        <label className="text-sm">
          <span className={label}>Name (optional)</span>
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className={box}
            placeholder="Ravi Kumar"
          />
        </label>
        <label className="text-sm">
          <span className={label}>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={box}>
            <option value="STAFF">Sales</option>
            <option value="FACTORY">Factory</option>
            <option value="ADMIN">Management (full access)</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
      <label className="mt-3 block max-w-xs text-sm">
        <span className={label}>Mobile (optional)</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          className={`${box} font-mono`}
          placeholder="9876543210"
          inputMode="tel"
        />
      </label>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
      {share ? (
        <ShareInviteLink joinUrl={share.joinUrl} phone={share.phone} companyName={companyName} />
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        They get an email with a link (you can also share it on WhatsApp), choose a password, and join with this role.
        Links work for 7 days. A pending invite does not use a seat.
      </p>
    </div>
  );
}
