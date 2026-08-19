import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { formatDateTime } from "@/lib/format";
import {
  PROVIDER_BY_SLUG,
  PROVIDER_LABELS,
  providerConfigured,
  type ProviderSlug,
} from "@/lib/integrations/accounting";
import { PageHeader, Card } from "../_components/ui";
import { findPendingCustomerMatches } from "@/lib/orders/reconcile";
import { ImportClient } from "./import-client";
import { LiveSyncCard, type ProviderStatus } from "./live-sync";
import { PendingOrdersResolver } from "./pending-orders";
import { isTallyEnabled } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAdmin();

  const [connections, pending, tallyOn] = await Promise.all([
    db.accountingConnection.findMany(),
    findPendingCustomerMatches(),
    isTallyEnabled(),
  ]);
  const providers: ProviderStatus[] = (
    Object.entries(PROVIDER_BY_SLUG) as [
      ProviderSlug,
      (typeof PROVIDER_BY_SLUG)[ProviderSlug],
    ][]
  ).map(([slug, provider]) => {
    const conn = connections.find((c) => c.provider === provider);
    return {
      provider,
      slug,
      label: PROVIDER_LABELS[provider],
      configured: providerConfigured(provider),
      connected: Boolean(conn),
      lastSyncAt: conn?.lastSyncAt ? formatDateTime(conn.lastSyncAt) : null,
    };
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Import data"
        subtitle="Bring in parties and invoices from Tally, Zoho Books, or Excel via CSV export."
      />
      <ImportClient />

      <div className="mt-8 max-w-3xl space-y-6">
        <Card title="Pending customer matches">
          <PendingOrdersResolver pending={pending} />
        </Card>

        <Card title="Live accounting sync">
          <p className="mb-4 text-xs text-muted-foreground">
            Pull customers and open invoices directly. Synced records go
            through the same validation and de-duplication as a CSV import —
            re-syncing updates rather than duplicates.
          </p>
          <LiveSyncCard providers={providers} />
        </Card>

        {tallyOn && (
          <Card title="Tally (on-premise)">
            <p className="text-xs text-muted-foreground">
              Tally runs on your local network, so the cloud cannot reach it
              directly. Run the bundled sync agent on the machine that runs
              Tally — it reads Sundry Debtors ledgers and sales vouchers over
              Tally&apos;s local HTTP port and pushes them here through the
              same import pipeline. See{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                tools/tally-sync-agent.mjs
              </code>{" "}
              in the repository for setup (needs the{" "}
              <code className="rounded bg-muted px-1 py-0.5">TALLY_SYNC_SECRET</code>{" "}
              deployment env var). Schedule it nightly with Task Scheduler or cron.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
