import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";

// SY22 — cron / platform helper.
//
// Every scheduled pass now runs per-organization so one tenant's
// failing send / bad settings can't block anyone else's. `db` is
// imported directly here because this file lives in lib/platform,
// which is the sanctioned raw-db surface (see .eslintrc.json).

export type ActiveOrg = {
  id: string;
  name: string;
  slug: string;
};

export async function listActiveOrganizations(): Promise<ActiveOrg[]> {
  return db.organization.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Run `fn` for every ACTIVE organization. Never throws — a per-org
 * failure is captured via captureError and reported in the returned
 * summary. Callers assemble the per-org results as they see fit.
 */
export async function forEachActiveOrg<T>(
  scope: string,
  fn: (org: ActiveOrg) => Promise<T>,
): Promise<{ ok: { org: ActiveOrg; result: T }[]; failed: { org: ActiveOrg; error: unknown }[] }> {
  const orgs = await listActiveOrganizations();
  const ok: { org: ActiveOrg; result: T }[] = [];
  const failed: { org: ActiveOrg; error: unknown }[] = [];
  for (const org of orgs) {
    try {
      const result = await fn(org);
      ok.push({ org, result });
    } catch (e) {
      failed.push({ org, error: e });
      await captureError(e, { scope, orgId: org.id, orgSlug: org.slug });
    }
  }
  return { ok, failed };
}
