import { tenantDb } from "@/lib/tenant";
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
  const db = tenantDb((await requireAdmin()).organizationId);

  const [connections, pending, tallyOn] = await Promise.all([
    db.accountingConnection.findMany(),
    findPendingCustomerMatches(db),
    isTallyEnabled(db),
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

      <div className="mt-8 max-w-3xl">
        <Card title="Excel templates">
          <p className="mb-3 text-xs text-muted-foreground">
            Download a CSV with Tally-export column names, paste your data,
            re-upload above. Every column past the required ones is optional.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/import/templates/customers"
              className="rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              customers.csv
            </a>
            <a
              href="/api/import/templates/outstanding-invoices"
              className="rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              outstanding-invoices.csv
            </a>
          </div>
        </Card>
      </div>

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
              Tally runs on your local network. Pair the Syncit connector
              on your Tally PC from{" "}
              <a
                className="font-semibold text-primary underline underline-offset-4"
                href="/settings/tally"
              >
                Settings → Tally
              </a>{" "}
              — generate an 8-character pairing code, enter it in the
              connector, and Tally starts syncing every 5 minutes.
              Download the connector from{" "}
              <a
                className="font-semibold text-primary underline underline-offset-4"
                href="/download#tally"
              >
                /download
              </a>
              .
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
