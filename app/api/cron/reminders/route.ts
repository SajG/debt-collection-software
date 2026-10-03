import { NextResponse, type NextRequest } from "next/server";
import { tenantDb } from "@/lib/tenant";
import { refreshOverdueStatuses } from "@/lib/ar/balance";
import { refreshRiskLevels } from "@/lib/ar/refresh";
import { sendReminder } from "@/lib/messaging/send";
import { captureError } from "@/lib/monitoring";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { forEachActiveOrg } from "@/lib/platform/orgs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily maintenance + automated reminder pass. Triggered by Vercel Cron (or
// any scheduler) with `Authorization: Bearer $CRON_SECRET`.
//
// Sequencing per party: WhatsApp first; SMS then email only as fallbacks
// when the previous channel FAILED (provider/config error). A gate BLOCK is
// final for the party — the gate rules the party, not the channel.
export async function GET(request: NextRequest) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    return await runCronPass();
  } catch (e) {
    // The scheduler only sees an HTTP status — without this, a crashed pass
    // (DB down, provider misconfigured) is invisible until someone notices
    // reminders stopped going out.
    await captureError(e, { scope: "cron.reminders" });
    return NextResponse.json({ error: "Cron pass failed" }, { status: 500 });
  }
}

type OrgSummary = {
  orgId: string;
  orgSlug: string;
  overdueMarked: number;
  riskUpdated: number;
  remindersSent: number;
  remindersBlocked: number;
  remindersFailed: number;
  autoRemindersEnabled: boolean;
};

async function runForOrg(orgId: string, orgSlug: string): Promise<OrgSummary> {
  // SY32 — everything below is scoped to this one company.
  const db = tenantDb(orgId);
  // SY22 — per-org pass. refreshOverdueStatuses / refreshRiskLevels
  // still run globally over Invoices/Parties; tenant scoping is
  // enforced by their SQL predicates elsewhere. The reminders send
  // loop is org-scoped so one distributor's WhatsApp outage can't
  // block another's.
  const overdueMarked = await db.$transaction((tx) => refreshOverdueStatuses(tx));
  const riskUpdated = await refreshRiskLevels(db);

  const settings = await db.businessSettings.findFirst({
    where: { organizationId: orgId },
  });
  const summary: OrgSummary = {
    orgId,
    orgSlug,
    overdueMarked,
    riskUpdated,
    remindersSent: 0,
    remindersBlocked: 0,
    remindersFailed: 0,
    autoRemindersEnabled: settings?.autoRemindersEnabled ?? false,
  };
  if (!settings?.autoRemindersEnabled) return summary;

  const parties = await db.party.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      consentStatus: "OPTED_IN",
      outreachPaused: false,
      totalOutstanding: { gt: 0 },
      invoices: { some: { status: "OVERDUE" } },
    },
    take: 500,
  });

  for (const party of parties) {
    const oldestOverdue = await db.invoice.findFirst({
      where: { partyId: party.id, status: "OVERDUE" },
      orderBy: { dueDate: "asc" },
      select: { id: true },
    });

    let done = false;
    for (const channel of ["WHATSAPP", "SMS", "EMAIL"] as const) {
      const result = await sendReminder({
        organizationId: orgId,
        partyId: party.id,
        channel,
        invoiceId: oldestOverdue?.id ?? null,
        sentById: null,
      });
      if (result.status === "sent") {
        summary.remindersSent++;
        done = true;
        break;
      }
      if (result.status === "blocked") {
        summary.remindersBlocked++;
        done = true;
        break;
      }
    }
    if (!done) summary.remindersFailed++;
  }
  return summary;
}

async function runCronPass() {
  const { ok, failed } = await forEachActiveOrg(
    "cron.reminders",
    (org) => runForOrg(org.id, org.slug),
  );
  return NextResponse.json({
    orgsProcessed: ok.length,
    orgsFailed: failed.length,
    perOrg: ok.map((r) => r.result),
  });
}
