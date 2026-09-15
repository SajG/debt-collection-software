import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";
import { runAutoFlag, runRecommendationRefresh, assemblePlanParties } from "@/lib/recovery/run";
import { buildDailyPlan } from "@/lib/recovery/plan";
import { renderStaffDigest, renderAdminDigest } from "@/lib/recovery/digest";
import { sendStaffWhatsApp } from "@/lib/messaging/internal";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const log = await db.syncLog.create({
    data: { syncType: "RECOVERY_CRON", status: "IN_PROGRESS" },
  });

  const summary = {
    flagged: 0,
    checked: 0,
    recsRefreshed: 0,
    digestsSent: 0,
    digestsSkipped: 0,
    digestsFailed: 0,
    errors: [] as string[],
  };

  try {
    const r = await runAutoFlag();
    summary.flagged = r.flagged;
    summary.checked = r.checked;
  } catch (e) {
    summary.errors.push(`autoFlag: ${e instanceof Error ? e.message : String(e)}`);
    await captureError(e, { scope: "cron.recovery.autoFlag" });
  }

  try {
    const r = await runRecommendationRefresh();
    summary.recsRefreshed = r.refreshed;
  } catch (e) {
    summary.errors.push(`recRefresh: ${e instanceof Error ? e.message : String(e)}`);
    await captureError(e, { scope: "cron.recovery.recRefresh" });
  }

  try {
    const now = new Date();
    const plan = buildDailyPlan(await assemblePlanParties(now));
    const profiles = await db.profile.findMany();
    const staffNames = new Map(profiles.map((p) => [p.id, p.ownerName]));

    for (const [staffId, entries] of Array.from(plan.byStaff.entries())) {
      const profile = profiles.find((p) => p.id === staffId);
      if (!profile?.phone) {
        summary.digestsSkipped++;
        continue;
      }
      const sent = await sendStaffWhatsApp(
        profile.phone,
        renderStaffDigest(profile.ownerName, entries, now)
      );
      if (sent.ok) summary.digestsSent++;
      else {
        summary.digestsFailed++;
        summary.errors.push(`digest ${profile.ownerName}: ${sent.error}`);
      }
    }

    const adminText = renderAdminDigest(plan, staffNames, now);
    for (const admin of profiles.filter((p) => p.role === "ADMIN" && p.phone)) {
      const sent = await sendStaffWhatsApp(admin.phone!, adminText);
      if (sent.ok) summary.digestsSent++;
      else {
        summary.digestsFailed++;
        summary.errors.push(`admin digest: ${sent.error}`);
      }
    }
  } catch (e) {
    summary.errors.push(`digest: ${e instanceof Error ? e.message : String(e)}`);
    await captureError(e, { scope: "cron.recovery.digest" });
  }

  await db.syncLog.update({
    where: { id: log.id },
    data: {
      status: summary.errors.length === 0 ? "COMPLETED" : "PARTIAL",
      completedAt: new Date(),
      details: summary,
    },
  });

  return NextResponse.json(summary);
}
