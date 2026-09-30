import { db } from "@/lib/db";

// SY21 — tenancy resolver.
//
// Every write that used to rely on a globally-unique key (Tally
// voucher ref, provider link id, accounting provider, etc.) now
// needs an organizationId to disambiguate. Callers on a
// still-single-tenant deployment lift the id from the caller's
// Profile → Membership; the seed / Tally-sync / cron paths fall
// back to the default organization (Synergy during migration).
//
// This helper is a read-through cache: getDefaultOrgId() runs one
// SELECT per process and pins the answer, since the answer is
// stable inside a Node lambda's warm lifetime. Invalidate by
// restarting the process (or add a bust once we support multiple
// tenants in the same runtime).

let cachedDefault: string | null = null;

async function fetchSynergyOrgId(): Promise<string> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM "Organization" WHERE slug = 'synergy' LIMIT 1
  `;
  const found = rows[0]?.id;
  if (found) return found;
  // Fallback: the migration always inserts synergy first, but if we
  // land on an unmigrated / brand-new DB, use whatever the oldest
  // Organization row is.
  const anyRows = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1
  `;
  if (anyRows[0]?.id) return anyRows[0].id;
  throw new Error(
    "SY21: no Organization row found. Run the multi_tenant_orgs migration.",
  );
}

export async function getDefaultOrgId(): Promise<string> {
  if (cachedDefault) return cachedDefault;
  cachedDefault = await fetchSynergyOrgId();
  return cachedDefault;
}

/**
 * Resolve the caller's active organization id. During the single-
 * tenant migration window this always returns Synergy; when SY22
 * lands and Membership drives scoping, this reads the caller's
 * primary active Membership row.
 */
export async function resolveOrgIdFromProfile(
  profileId: string,
): Promise<string> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT m."organizationId"::text AS id
      FROM "Membership" m
     WHERE m."profileId"  = ${profileId}::uuid
       AND m."isActive"   = true
     ORDER BY m."isOwner" DESC, m."createdAt" ASC
     LIMIT 1
  `;
  if (rows[0]?.id) return rows[0].id;
  return getDefaultOrgId();
}
