"use client";

import { useState } from "react";
import { Check, Link2, Loader2 } from "lucide-react";

// "Copy statement link" — asks the server for a signed 7-day link to
// this customer's statement and puts it on the clipboard, ready to
// paste into WhatsApp or an email.
export function StatementLinkButton({ partyId }: { partyId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);

  async function copy() {
    setState("busy");
    try {
      const res = await fetch(`/api/parties/${partyId}/statement?link=1`, { cache: "no-store" });
      const body = (await res.json()) as { url?: string };
      if (!res.ok || !body.url) throw new Error("no link");
      setUrl(body.url);
      await navigator.clipboard.writeText(body.url);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={copy}
        disabled={state === "busy"}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        {state === "busy" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "copied" ? (
          <Check className="h-4 w-4" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {state === "copied" ? "Link copied (valid 7 days)" : "Copy statement link"}
      </button>
      {state === "error" ? (
        <span className="text-xs text-red-700">
          {url ? `Copy it yourself: ${url}` : "Could not create the link. Try again."}
        </span>
      ) : null}
    </span>
  );
}
