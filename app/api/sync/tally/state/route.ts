import { NextResponse, type NextRequest } from "next/server";
import { tenantDb } from "@/lib/tenant";
import { getLegacySynergyOrgIdForTallySecret } from "@/lib/platform/legacy-tally";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { findTallyConnectorByTokenHash } from "@/lib/platform/resolve";
import { hashSecret } from "@/lib/tally/pairing";

export const dynamic = "force-dynamic";

// Small state endpoint for the LAN sync agent — returns the date of the last
// successful invoice import so the agent can request only NEW vouchers from
// Tally (SVFROMDATE / SVTODATE), instead of dumping the whole voucher book
// on every run. Avoids Tally hangs on large ledgers.
//
// Auth: same as POST /api/sync/tally — a paired connector's syt_ token
// (answers for THAT connector's company), or the legacy shared secret
// (Synergy only). Without the token branch every paired connector got
// 401 here and fell back to a FULL voucher pull on every run.

async function orgForRequest(request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const secret = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (secret.startsWith("syt_")) {
    const connector = await findTallyConnectorByTokenHash(hashSecret(secret));
    if (!connector || connector.revokedAt) return null;
    return connector.organizationId;
  }
  if (verifyBearer(header, process.env.TALLY_SYNC_SECRET)) {
    return getLegacySynergyOrgIdForTallySecret();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const organizationId = await orgForRequest(request);
  if (!organizationId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Prefer the most recent COMPLETED / PARTIAL sync — PARTIAL still means the
  // pull got through, just with per-row failures we don't want to re-attempt
  // on every run.
  // Only the caller's own company's sync history.
  const db = tenantDb(organizationId);
  const lastInvoiceSync = await db.syncLog.findFirst({
    where: {
      syncType: "IMPORT_INVOICES",
      status: { in: ["COMPLETED", "PARTIAL"] },
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true, startedAt: true },
  });

  const lastStockSync = await db.syncLog.findFirst({
    where: {
      syncType: "IMPORT_STOCK_ITEMS",
      status: { in: ["COMPLETED", "PARTIAL"] },
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  return NextResponse.json({
    lastInvoiceSyncAt:
      (lastInvoiceSync?.completedAt ?? lastInvoiceSync?.startedAt)?.toISOString() ??
      null,
    lastStockSyncAt: lastStockSync?.completedAt?.toISOString() ?? null,
  });
}
