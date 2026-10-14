"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// SY38 — Settings → "Invite another business". The link carries this
// company's referral code; /r/<code> forwards to sign-up with it.
export function ReferralLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        aria-label="Your invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground"
      />
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {state === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {state === "copied" ? "Copied" : "Copy link"}
      </button>
      {state === "error" ? (
        <span className="w-full text-xs text-muted-foreground">
          Could not copy. Select the link and copy it yourself.
        </span>
      ) : null}
    </div>
  );
}
