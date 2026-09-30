"use client";

import { useState, useTransition } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { generatePairingCodeAction } from "./actions";

// SY27 — client half of Settings → Tally. Renders the "Generate
// pairing code" button and reveals the plaintext once so the admin
// can read it into the connector app on the Tally PC.

export function PairPanel() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await generatePairingCodeAction();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setCode(res.data!.code);
      setExpiresAt(res.data!.expiresAt);
    });
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore — the code is on screen anyway */
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold mb-1">Connect Tally</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Generate a one-time code, then enter it in the Syncit Tally
        connector on the Windows PC that runs Tally. Code expires in 15
        minutes.
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {code ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="font-mono text-3xl font-bold tracking-widest px-5 py-3 rounded-lg bg-muted select-all">
              {code}
            </div>
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Valid until{" "}
            {expiresAt ? new Date(expiresAt).toLocaleTimeString() : "—"}.
            One-shot — after use, generate a fresh code for another PC.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
          >
            Generate a different code
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Generate pairing code
        </button>
      )}

      <div className="mt-5 rounded-md border border-border bg-muted/40 p-4 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Where to enter it:</strong> download the connector from{" "}
          <a href="/download#tally" className="text-primary underline underline-offset-4">
            /download
          </a>
          , install on the Tally PC, and paste the code on the first
          screen. Syncit URL defaults to https://getsyncit.app.
        </p>
      </div>
    </div>
  );
}
