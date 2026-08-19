import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyBearer } from "@/lib/auth/verify-bearer";

export const dynamic = "force-dynamic";

// Small state endpoint for the LAN sync agent — returns the date of the last
// successful invoice import so the agent can request only NEW vouchers from
// Tally (SVFROMDATE / SVTODATE), instead of dumping the whole voucher book
// on every run. Avoids Tally hangs on large ledgers.
//
// Auth: same bearer secret as POST /api/sync/tally.

export async function GET(request: NextRequest) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.TALLY_SYNC_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Prefer the most recent COMPLETED / PARTIAL sync — PARTIAL still means the
  // pull got through, just with per-row failures we don't want to re-attempt
  // on every run.
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
