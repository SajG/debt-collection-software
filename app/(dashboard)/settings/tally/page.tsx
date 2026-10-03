import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { tenantDb } from "@/lib/tenant";
import { requireProfile } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { PairPanel } from "./pair-panel";
import { ConnectorsList } from "./connectors-list";
import { friendlyTallyError } from "@/lib/tally/errors";
import { orgHasFeature } from "@/lib/platform/billing";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tally connection — Syncit",
};

export const dynamic = "force-dynamic";

// SY27 — Settings → Tally.
//
// Two panels:
//   1. Generate a one-time 8-character pairing code (server action
//      returns the plaintext once for the admin to copy into the
//      Windows connector). Expires in 15 minutes.
//   2. List of paired PCs — last-seen / last-sync / rows / last-error /
//      revoke. Errors from the connector are converted to plain
//      English via friendlyTallyError() so admins see actionable
//      messages instead of ECONNREFUSED.
//
// STAFF / FACTORY users are redirected — the page is admin-only.

export default async function TallySettingsPage() {
  const profile = await requireProfile();
  const db = tenantDb(profile.organizationId);
  if (profile.role !== "ADMIN") redirect("/settings");

  const organizationId = profile.organizationId;
  const tallyOnPlan = await orgHasFeature(organizationId, "tallyLiveSync");
  const connectors = await db.tallyConnector.findMany({
    where: { organizationId },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  const rows = connectors.map((c) => ({
    id: c.id,
    name: c.name,
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastErrorFriendly: friendlyTallyError(c.lastError),
    rowsSyncedTotal: c.rowsSyncedTotal,
    revokedAt: c.revokedAt?.toISOString() ?? null,
  }));

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader
        title="Tally connection"
        subtitle="Pair the Windows connector on your Tally PC. Every paired PC syncs into this workspace only."
      />

      {tallyOnPlan ? (
        <PairPanel />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 p-6 text-sm">
          <span>
            Tally live sync is part of the Growth plan. On your current plan,
            bring data in with Excel import.
          </span>
          <Link href="/settings/billing" className="font-medium text-primary hover:underline">
            Upgrade plan
          </Link>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Connected PCs</h2>
        <ConnectorsList rows={rows} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 text-sm">
        <h3 className="font-semibold mb-2">Troubleshooting</h3>
        <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
          <li>
            <strong>Tally is not running:</strong> open Tally on the PC and
            load the company you want to sync.
          </li>
          <li>
            <strong>Port 9000 not enabled:</strong> in Tally, F12 → Advanced →
            Allow ODBC / HTTP. Restart Tally.
          </li>
          <li>
            <strong>Firewall or antivirus:</strong> allow the Syncit connector
            to reach https://getsyncit.app.
          </li>
          <li>
            <strong>Multiple companies loaded:</strong> the connector will
            prompt you to pick one at first pair. Change it later from the
            connector tray menu.
          </li>
        </ul>
      </div>
    </div>
  );
}
