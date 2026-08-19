"use client";

import { useState, useTransition } from "react";
import { promoteNewCustomerNameAction } from "./actions";

// Per-row inline form. Kept tiny — director's flow is "pick the
// spelling I want to keep, tap Convert, move on". No modal, no
// wizard. Every field except name is optional; details can be
// filled on the party page afterwards.
export function PromoteForm({
  fromName,
  orderCount,
  assignees,
}: {
  fromName: string;
  orderCount: number;
  assignees: { id: string; ownerName: string; role: string }[];
}) {
  const [name, setName] = useState(fromName);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>(
    assignees[0]?.id ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const res = await promoteNewCustomerNameAction({
        fromName,
        name: name.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        assignedToId: assigneeId || undefined,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setMsg(
        `Converted. ${res.ordersUpdated} order${res.ordersUpdated === 1 ? "" : "s"} back-filled.`,
      );
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-4">
        <input
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Party name"
        />
        <input
          className="rounded-md border border-border bg-background px-2 py-1 text-sm font-mono"
          value={phone}
          onChange={(e) =>
            setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
          }
          placeholder="Phone (10 digits)"
          inputMode="tel"
        />
        <input
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
        />
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.ownerName} ({a.role})
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim().length < 2}
          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending
            ? "Converting…"
            : `Convert & back-fill ${orderCount} order${orderCount === 1 ? "" : "s"}`}
        </button>
        {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
