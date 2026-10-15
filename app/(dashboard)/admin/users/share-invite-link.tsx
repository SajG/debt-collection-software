"use client";

import { useState } from "react";

// Go-live fix: most factory and field staff live on WhatsApp, not email.
// After an invite is created (or resent) the manager can copy the join
// link or open WhatsApp with it pre-filled. The link is the same one
// the email carries and works once, for 7 days.

export function ShareInviteLink({
  joinUrl,
  companyName,
  phone,
}: {
  joinUrl: string;
  companyName?: string | null;
  phone?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const text =
    `You're invited to join ${companyName || "our company"} on Syncit. ` +
    `Open this link on your phone to set up your account: ${joinUrl}`;
  const digits = (phone ?? "").replace(/\D/g, "").slice(-10);
  const waHref = `https://wa.me/${digits.length === 10 ? `91${digits}` : ""}?text=${encodeURIComponent(text)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Share this link with them on WhatsApp or SMS. It works once and expires in 7 days.
      </p>
      <input
        readOnly
        value={joinUrl}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono text-xs"
        aria-label="Invitation link"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Share on WhatsApp
        </a>
      </div>
    </div>
  );
}
