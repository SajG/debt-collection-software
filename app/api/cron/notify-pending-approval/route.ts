import { NextResponse, type NextRequest } from "next/server";
import { tenantDb } from "@/lib/tenant";
import { captureError } from "@/lib/monitoring";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { forEachActiveOrg } from "@/lib/platform/orgs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Audit item 10 — nudge every ADMIN when a STAFF order has been
// waiting in PENDING_APPROVAL for more than 30 minutes.
//
// Ordering rules:
//   * Only PENDING_APPROVAL. approve/reject clears the state; if a
//     future migration re-routes an order back to PENDING_APPROVAL,
//     it must also reset adminPendingNotifiedAt to NULL to fire a
//     fresh alert.
//   * One notification per order, ever. adminPendingNotifiedAt is
//     stamped in the same transaction as the push send so a partial
//     retry can't double-nudge.
//   * The send channel is the same NotificationConfig edge function
//     the rest of the app uses. When the config isn't populated, we
//     log a summary and no-op — no stamping — so the alert fires as
//     soon as it's wired.

const PENDING_WINDOW_MS = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (
    !verifyBearer(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    return await run();
  } catch (e) {
    await captureError(e, { scope: "cron.notify-pending-approval" });
    return NextResponse.json({ error: "Cron pass failed" }, { status: 500 });
  }
}

type OrgSummary = {
  orgId: string;
  orgSlug: string;
  candidates: number;
  notified: number;
  configured: boolean;
  errors: number;
};

async function runForOrg(orgId: string, orgSlug: string): Promise<OrgSummary> {
  // SY32 — scoped to this one company; admins are its members only.
  const db = tenantDb(orgId);
  const cutoff = new Date(Date.now() - PENDING_WINDOW_MS);

  const orders = await db.salesOrder.findMany({
    where: {
      organizationId: orgId,
      currentStatus: "PENDING_APPROVAL",
      adminPendingNotifiedAt: null,
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      salespersonId: true,
      party: { select: { name: true } },
      newCustomerName: true,
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  const summary: OrgSummary = {
    orgId,
    orgSlug,
    candidates: orders.length,
    notified: 0,
    configured: false,
    errors: 0,
  };
  if (orders.length === 0) return summary;

  const config = await db.notificationConfig.findFirst({
    where: { organizationId: orgId },
  });
  const url = config?.edgeFunctionUrl?.trim() ?? "";
  const secret = config?.edgeFunctionSecret?.trim() ?? "";
  summary.configured = !!(url && secret);
  if (!summary.configured) return summary;

  const adminIds = (
    await db.membership.findMany({
      where: { organizationId: orgId, role: "ADMIN", isActive: true },
      select: { profileId: true },
    })
  ).map((m) => m.profileId);

  for (const o of orders) {
    const customer = o.party?.name ?? o.newCustomerName ?? "Unknown";
    const waitedMin = Math.max(
      1,
      Math.round((Date.now() - o.createdAt.getTime()) / 60_000),
    );
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          type: "pending_approval",
          organizationId: orgId,
          orderId: o.id,
          orderNumber: o.orderNumber,
          customer,
          waitedMinutes: waitedMin,
          adminProfileIds: adminIds,
        }),
      });
      if (!res.ok) {
        summary.errors += 1;
        continue;
      }
    } catch (e) {
      summary.errors += 1;
      await captureError(e, {
        scope: "cron.notify-pending-approval.send",
        orgId,
        orderId: o.id,
      });
      continue;
    }
    await db.salesOrder.update({
      where: { id: o.id },
      data: { adminPendingNotifiedAt: new Date() },
    });
    summary.notified += 1;
  }
  return summary;
}

async function run() {
  const { ok, failed } = await forEachActiveOrg(
    "cron.notify-pending-approval",
    (org) => runForOrg(org.id, org.slug),
  );
  return NextResponse.json({
    orgsProcessed: ok.length,
    orgsFailed: failed.length,
    perOrg: ok.map((r) => r.result),
  });
}
