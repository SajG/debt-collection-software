"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

// SY23 — company switcher for users with more than one active
// membership. Renders inline in the dashboard header; a single
// membership renders as static text (no menu).
//
// Switching hits POST /api/session/active-org which writes the JWT
// claim `active_org_id`. We reload the page after success so every
// server component re-runs with the new tenant scope.

export type SwitcherOrg = {
  id: string;
  name: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
};

export function CompanySwitcher({
  active,
  memberships,
}: {
  active: SwitcherOrg;
  memberships: SwitcherOrg[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    return (
      <span
        className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm font-semibold text-foreground"
        title="You belong to one company"
      >
        {active.name}
      </span>
    );
  }

  function switchTo(orgId: string) {
    if (orgId === active.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/session/active-org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        setOpen(false);
        return;
      }
      // Force a full reload so RLS + server components see the new claim.
      window.location.href = "/dashboard";
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/40 disabled:opacity-60"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : null}
        <span>{active.name}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-md border border-border bg-white shadow-lg"
        >
          {memberships.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => switchTo(m.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <span className="min-w-0 truncate">
                  <span className="block font-medium text-foreground">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">{m.role}</span>
                </span>
                {m.id === active.id ? (
                  <Check size={14} className="text-primary" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
