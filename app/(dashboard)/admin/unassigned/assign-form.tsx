"use client";

import { useMemo, useState, useTransition } from "react";
import { bulkAssignPartiesAction } from "./actions";

// Client component — holds selection state, submits the batch, shows
// the count that actually changed. Kept small (no drag-select, no
// keyboard shortcuts) because the "make Tally optional" pool should
// shrink to zero as soon as an admin walks through it once.
export function AssignPartiesForm({
  parties,
  assignees,
}: {
  parties: {
    id: string;
    name: string;
    city: string | null;
    totalOutstanding: string;
  }[];
  assignees: { id: string; ownerName: string; role: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigneeId, setAssigneeId] = useState<string>(
    assignees[0]?.id ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = useMemo(
    () => parties.length > 0 && selected.size === parties.length,
    [parties, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(parties.map((p) => p.id)));
  }

  function submit() {
    if (!assigneeId || selected.size === 0) return;
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const res = await bulkAssignPartiesAction({
        partyIds: Array.from(selected),
        assigneeId,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setMsg(`Assigned ${res.count} of ${selected.size} selected.`);
      setSelected(new Set());
    });
  }

  if (parties.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unassigned parties. Everything has an owner.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
        <label className="text-sm">
          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assign to
          </span>
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
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0 || !assigneeId}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Assigning…" : `Assign ${selected.size} selected`}
        </button>
        <span className="text-xs text-muted-foreground">
          Only rows still unassigned at submit time are changed — safe
          to click twice.
        </span>
      </div>
      {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">City</th>
              <th className="py-2 pr-3 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={`Select ${p.name}`}
                  />
                </td>
                <td className="py-2 pr-3">{p.name}</td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {p.city ?? "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {p.totalOutstanding}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
