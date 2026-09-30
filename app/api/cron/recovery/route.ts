import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";
import { runAutoFlag, runRecommendationRefresh, assemblePlanParties } from "@/lib/recovery/run";
import { buildDailyPlan } from "@/lib/recovery/plan";
import { renderStaffDigest, renderAdminDigest } from "@/lib/recovery/digest";
import { sendStaffWhatsApp } from "@/lib/messaging/internal";
import { forEachActiveOrg } from "@/lib/platform/orgs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // SY22 — per-org pass. runAutoFlag / runRecommendationRefresh /
  // assemblePlanParties still read tables globally; the org loop
  // sends digests per tenant and stamps a per-org SyncLog row so
  // one tenant's WhatsApp fault can't stop another's.
  const { ok } = await forEachActiveOrg("cron.recovery", async (org) => {
    const orgSummary = {
      orgId: org.id,
      orgSlug: org.slug,
      flagged: 0,
      checked: 0,
      recsRefreshed: 0,
      digestsSent: 0,
      digestsSkipped: 0,
      digestsFailed: 0,
      errors: [] as string[],
    };

    const log = await db.syncLog.create({
      data: {
        syncType: "RECOVERY_CRON",
        status: "IN_PROGRESS",
        organizationId: org.id,
      },
    });

    try {
      const r = await runAutoFlag();
      orgSummary.flagged = r.flagged;
      orgSummary.checked = r.checked;
    } catch (e) {
      orgSummary.errors.push(
        `autoFlag: ${e instanceof Error ? e.message : String(e)}`,
      );
      await captureError(e, { scope: "cron.recovery.autoFlag", orgId: org.id });
    }

    try {
      const r = await runRecommendationRefresh();
      orgSummary.recsRefreshed = r.refreshed;
    } catch (e) {
      orgSummary.errors.push(
        `recRefresh: ${e instanceof Error ? e.message : String(e)}`,
      );
      await captureError(e, { scope: "cron.recovery.recRefresh", orgId: org.id });
    }

    try {
      const now = new Date();
      const plan = buildDailyPlan(await assemblePlanParties(now));

      // SY22 — profiles scoped to this org via Membership.
      const memberships = await db.membership.findMany({
        where: { organizationId: org.id, isActive: true },
        select: {
          role: true,
          profile: { select: { id: true, ownerName: true, phone: true } },
        },
      });
      const staffNames = new Map(memberships.map((m) => [m.profile.id, m.profile.ownerName]));

      for (const [staffId, entries] of Array.from(plan.byStaff.entries())) {
        const member = memberships.find((m) => m.profile.id === staffId);
        if (!member?.profile.phone) {
          orgSummary.digestsSkipped++;
          continue;
        }
        const sent = await sendStaffWhatsApp(
          member.profile.phone,
          renderStaffDigest(member.profile.ownerName, entries, now),
        );
        if (sent.ok) orgSummary.digestsSent++;
        else {
          orgSummary.digestsFailed++;
          orgSummary.errors.push(`digest ${member.profile.ownerName}: ${sent.error}`);
        }
      }

      const adminText = renderAdminDigest(plan, staffNames, now);
      for (const m of memberships.filter((x) => x.role === "ADMIN" && x.profile.phone)) {
        const sent = await sendStaffWhatsApp(m.profile.phone!, adminText);
        if (sent.ok) orgSummary.digestsSent++;
        else {
          orgSummary.digestsFailed++;
          orgSummary.errors.push(`admin digest: ${sent.error}`);
        }
      }
    } catch (e) {
      orgSummary.errors.push(
        `digest: ${e instanceof Error ? e.message : String(e)}`,
      );
      await captureError(e, { scope: "cron.recovery.digest", orgId: org.id });
    }

    await db.syncLog.update({
      where: { id: log.id },
      data: {
        status: orgSummary.errors.length === 0 ? "COMPLETED" : "PARTIAL",
        completedAt: new Date(),
        details: orgSummary,
      },
    });

    return orgSummary;
  });

  return NextResponse.json({
    orgsProcessed: ok.length,
    perOrg: ok.map((r) => r.result),
  });
}
