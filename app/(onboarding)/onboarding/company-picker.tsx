"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

// SY31 — shown when a user belongs to several companies but the
// session has no valid active_org_id. Same endpoint as the sidebar
// CompanySwitcher; a full reload picks up the new claim.

type Org = { id: string; name: string; role: "ADMIN" | "STAFF" | "FACTORY" };

export function CompanyPicker({ memberships }: { memberships: Org[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(orgId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/session/active-org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        setError("Couldn't open that company. Try again.");
        return;
      }
      window.location.href = "/dashboard";
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {memberships.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={pending}
          onClick={() => pick(m.id)}
          className="flex w-full items-center justify-between rounded-md border border-border px-4 py-3 text-left text-sm hover:bg-muted/40 disabled:opacity-60"
        >
          <span className="font-medium text-foreground">{m.name}</span>
          <span className="text-xs text-muted-foreground">{m.role}</span>
        </button>
      ))}
      {pending && <Loader2 size={16} className="mx-auto animate-spin" />}
    </div>
  );
}
