"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Link2 } from "lucide-react";
import type { AccountingProvider } from "@prisma/client";
import { btnSecondaryCls, Badge } from "../_components/ui";
import { syncAccountingProviderAction } from "./actions";

export type ProviderStatus = {
  provider: AccountingProvider;
  slug: string;
  label: string;
  configured: boolean;
  connected: boolean;
  lastSyncAt: string | null;
};

export function LiveSyncCard({ providers }: { providers: ProviderStatus[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function syncNow(p: ProviderStatus) {
    setSyncing(p.slug);
    setMessages((m) => ({ ...m, [p.slug]: "" }));
    startTransition(async () => {
      const result = await syncAccountingProviderAction(p.provider);
      setSyncing(null);
      if ("error" in result) {
        setMessages((m) => ({ ...m, [p.slug]: `Error: ${result.error}` }));
      } else {
        setMessages((m) => ({
          ...m,
          [p.slug]:
            `Parties: ${result.parties.imported} new, ${result.parties.skipped} updated/skipped. ` +
            `Invoices: ${result.invoices.imported} new, ${result.invoices.skipped} skipped.` +
            (result.parties.failed + result.invoices.failed > 0
              ? ` ${result.parties.failed + result.invoices.failed} failed — see sync log.`
              : ""),
        }));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <div
          key={p.slug}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white p-4"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{p.label}</span>
              {p.connected ? (
                <Badge tone="success">Connected</Badge>
              ) : p.configured ? (
                <Badge>Not connected</Badge>
              ) : (
                <Badge tone="amber">Needs API credentials</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {p.connected
                ? p.lastSyncAt
                  ? `Last synced ${p.lastSyncAt}`
                  : "Never synced"
                : p.configured
                  ? "Authorise access to pull customers and open invoices."
                  : `Set ${p.slug.replace(/-/g, "_").toUpperCase()}_CLIENT_ID / _CLIENT_SECRET in the deployment env first.`}
            </p>
            {messages[p.slug] && (
              <p
                className={`mt-1 text-xs ${
                  messages[p.slug].startsWith("Error")
                    ? "text-red-600"
                    : "text-emerald-700"
                }`}
              >
                {messages[p.slug]}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {p.connected && (
              <button
                className={btnSecondaryCls}
                disabled={syncing !== null}
                onClick={() => syncNow(p)}
              >
                {syncing === p.slug ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Sync now
              </button>
            )}
            {p.configured && (
              <a href={`/api/integrations/${p.slug}/connect`} className={btnSecondaryCls}>
                <Link2 size={16} />
                {p.connected ? "Reconnect" : "Connect"}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
