"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BulkToolbar } from "./bulk-toolbar";

// Client wrapper around the server-rendered approval Cards. Adds a
// per-row checkbox + "select all" that opens the sticky BulkToolbar.
// Rows are rendered by the parent server component (kept in
// page.tsx) — we accept them here as `children[]` addressed by id so
// each still ships as a Server Component render, which keeps the
// per-order Prisma reads on the server.
//
// Selection is client-side ephemeral: refreshing the page clears it.
// That is the correct behaviour — batched approvals are not resumable.

import type { ReactNode } from "react";

export type ApprovalRow = {
  id: string;
  content: ReactNode;
};

export function SelectableApprovalsList({ rows }: { rows: ApprovalRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

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
    else setSelected(new Set(rows.map((r) => r.id)));
  }
  function clearAndRefresh() {
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      <BulkToolbar
        selectedIds={Array.from(selected)}
        onDone={clearAndRefresh}
      />

      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          aria-label="Select all"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-border"
        />
        <span>
          Select all ({rows.length}) &middot; Cmd/Ctrl-click a checkbox to jump
          between rows
        </span>
      </div>

      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              aria-label={`Select order ${r.id}`}
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="mt-6 h-4 w-4 rounded border-border"
            />
            <div className="flex-1">{r.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
