import { NextResponse, type NextRequest } from "next/server";
import { reconcileNewCustomerOrders } from "@/lib/orders/reconcile";
import { captureError } from "@/lib/monitoring";
import { db } from "@/lib/db";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { isTallyEnabled } from "@/lib/settings";
import { forEachActiveOrg } from "@/lib/platform/orgs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Nightly job — promote free-text "new customer" sales orders to real
// ledger Parties once the customer appears in Tally. Triggered by Vercel
// Cron with `Authorization: Bearer $CRON_SECRET`.
//
// Also runnable from the sync agent's tail (Bearer TALLY_SYNC_SECRET) so a
// distributor can trigger reconciliation right after a Tally push without
// waiting for the nightly window.

export async function GET(request: NextRequest) {
  if (
    !verifyBearer(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
      process.env.TALLY_SYNC_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // SY22 — one pass per active org. isTallyEnabled currently reads
  // the sole settings row; per-org gating below skips orgs whose
  // BusinessSettings.tallyEnabled is false.
  const { ok } = await forEachActiveOrg("cron.reconcile-orders", async (org) => {
    const settings = await db.businessSettings.findFirst({
      where: { organizationId: org.id },
      select: { tallyEnabled: true },
    });
    if (!settings?.tallyEnabled) {
      return { orgId: org.id, orgSlug: org.slug, skipped: true as const };
    }

    const sync = await db.syncLog.create({
      data: {
        syncType: "FULL_IMPORT",
        status: "IN_PROGRESS",
        organizationId: org.id,
        details: { scope: "reconcile-orders" },
      },
    });
    try {
      const result = await reconcileNewCustomerOrders();
      await db.syncLog.update({
        where: { id: sync.id },
        data: {
          status: result.ambiguous > 0 ? "PARTIAL" : "COMPLETED",
          completedAt: new Date(),
          recordsTotal: result.scanned,
          recordsProcessed: result.matched,
          recordsFailed: result.ambiguous,
          details: {
            scope: "reconcile-orders",
            matched: result.matched,
            ambiguous: result.ambiguous,
            unmatched: result.unmatched,
            ambiguousNames: result.ambiguousNames,
          },
        },
      });
      return { orgId: org.id, orgSlug: org.slug, ...result };
    } catch (e) {
      await db.syncLog.update({
        where: { id: sync.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: e instanceof Error ? e.message : "reconcile failed",
        },
      });
      await captureError(e, { scope: "cron.reconcile-orders", orgId: org.id });
      throw e;
    }
  });

  return NextResponse.json({
    orgsProcessed: ok.length,
    perOrg: ok.map((r) => r.result),
  });
}
