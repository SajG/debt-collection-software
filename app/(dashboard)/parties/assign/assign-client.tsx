"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, Table, Th, Td, EmptyRow } from "../../_components/ui";
import { bulkAssignPartiesAction } from "../actions";

export type AssignableParty = {
  id: string;
  name: string;
  outstanding: string; // pre-formatted
  assignedToName: string | null;
};

export function AssignClient({
  parties,
  staff,
}: {
  parties: AssignableParty[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const allSelected = parties.length > 0 && selected.size === parties.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    setMessage(null);
    startTransition(async () => {
      const result = await bulkAssignPartiesAction({
        partyIds: Array.from(selected),
        assignedToId: target || null,
      });
      if ("error" in result) {
        setMessage({ kind: "error", text: result.error });
      } else {
        setMessage({
          kind: "ok",
          text: `${result.updated} ${result.updated === 1 ? "party" : "parties"} ${
            target ? "reassigned" : "unassigned"
          }.`,
        });
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            Assign selected to
          </span>
          <select
            className={`${inputCls} w-64`}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className={btnPrimaryCls}
          disabled={isPending || selected.size === 0}
          onClick={apply}
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          Apply to {selected.size} selected
        </button>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm ${
              message.kind === "error" ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      <Table>
        <thead>
          <tr>
            <Th>
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(parties.map((p) => p.id))
                  )
                }
              />
            </Th>
            <Th>Party</Th>
            <Th align="right">Outstanding</Th>
            <Th>Currently assigned to</Th>
          </tr>
        </thead>
        <tbody>
          {parties.length === 0 ? (
            <EmptyRow colSpan={4} message="No active parties." />
          ) : (
            parties.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer hover:bg-muted/30"
                onClick={() => toggle(p.id)}
              >
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.name}`}
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Td>
                <Td>
                  <span className="font-medium">{p.name}</span>
                </Td>
                <Td align="right">{p.outstanding}</Td>
                <Td>
                  <span className="text-muted-foreground">
                    {p.assignedToName ?? "Unassigned"}
                  </span>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
