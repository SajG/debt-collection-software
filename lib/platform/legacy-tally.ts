import { db } from "@/lib/db";

// SY21 → SY32 — the ONLY remaining Synergy lookup. Used by the legacy
// shared TALLY_SYNC_SECRET connector path (app/api/sync/tally) and
// scripts — machine contexts with no signed-in user. Never call it
// from pages, server actions or user-authenticated routes. Delete it
// once Synergy re-pairs with a per-org syt_ token (docs/TALLY.md).

let cached: string | null = null;

export async function getLegacySynergyOrgIdForTallySecret(): Promise<string> {
  if (cached) return cached;
  const row = await db.organization.findUnique({
    where: { slug: "synergy" },
    select: { id: true },
  });
  if (!row) {
    throw new Error(
      "SY21: no Organization with slug 'synergy'. Run the multi_tenant_orgs migration.",
    );
  }
  cached = row.id;
  return cached;
}
