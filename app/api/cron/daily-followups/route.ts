import { NextResponse, type NextRequest } from "next/server";
import { tenantDb } from "@/lib/tenant";
import { captureError } from "@/lib/monitoring";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { forEachActiveOrg } from "@/lib/platform/orgs";
import { loadFollowUps } from "@/lib/recovery/followups";
import { dailyPushRecipients, isSundayIn } from "@/lib/recovery/daily-push";
import { withCronRun } from "@/lib/platform/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SY29 — 9:00 IST push to each salesperson: "Today: 6 customers, ₹3.4L
// to follow up". Scheduled at 03:30 UTC Monday–Saturday (vercel.json).
//
// Per company (forEachActiveOrg + tenantDb): the count and amount are
// that salesperson's own Today list in that company, worked out by the
// same rules the app uses (packages/followups/rank.ts). Skipped on a
// Sunday in the company's timezone and for anyone with nothing to
// follow up. Delivery is the existing notify edge function (event
// "daily_followups"), which re-checks that each recipient is an active
// member of the company and has not switched the push off.

type OrgSummary = {
  orgId: string;
  orgSlug: string;
  skipped: "sunday" | "not_configured" | "nobody" | null;
  recipients: number;
  sent: number;
};

async function runForOrg(orgId: string, orgSlug: string, now: Date): Promise<OrgSummary> {
  const db = tenantDb(orgId);
  const summary: OrgSummary = { orgId, orgSlug, skipped: null, recipients: 0, sent: 0 };

  const settings = await db.businessSettings.findFirst({ select: { timezone: true } });
  if (isSundayIn(now, settings?.timezone ?? "Asia/Kolkata")) {
    summary.skipped = "sunday";
    return summary;
  }

  const config = await db.notificationConfig.findFirst({ where: { organizationId: orgId } });
  const url = config?.edgeFunctionUrl?.trim() ?? "";
  const secret = config?.edgeFunctionSecret?.trim() ?? "";
  if (!url || !secret) {
    summary.skipped = "not_configured";
    return summary;
  }

  // Sales and management members of THIS company who can still sign in.
  const members = await db.membership.findMany({
    where: { isActive: true, role: { in: ["STAFF", "ADMIN"] } },
    select: { profileId: true },
  });
  const { byStaff } = await loadFollowUps(db, now);
  const recipients = dailyPushRecipients(byStaff, new Set(members.map((m) => m.profileId)));
  summary.recipients = recipients.length;
  if (recipients.length === 0) {
    summary.skipped = "nobody";
    return summary;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-notify-secret": secret },
    body: JSON.stringify({ event: "daily_followups", organizationId: orgId, recipients }),
  });
  if (!res.ok) throw new Error(`notify returned HTTP ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as { sent?: number };
  summary.sent = body.sent ?? 0;
  return summary;
}

async function handle(request: NextRequest) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    const now = new Date();
    const { ok, failed } = await forEachActiveOrg("cron.daily-followups", (org) =>
      runForOrg(org.id, org.slug, now),
    );
    return NextResponse.json({
      orgsProcessed: ok.length,
      orgsFailed: failed.length,
      perOrg: ok.map((r) => r.result),
    });
  } catch (e) {
    await captureError(e, { scope: "cron.daily-followups" });
    return NextResponse.json({ error: "Cron pass failed" }, { status: 500 });
  }
}

// SY40 — records a CronRun row (duration, companies, failures).
export const GET = withCronRun("daily-followups", handle);
