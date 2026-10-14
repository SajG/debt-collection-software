import { NextResponse, type NextRequest } from "next/server";
import { tenantDb } from "@/lib/tenant";
import { refreshOverdueStatuses } from "@/lib/ar/balance";
import { refreshRiskLevels } from "@/lib/ar/refresh";
import type { MessageChannel } from "@prisma/client";
import { configuredChannels, partyReachableOn, sendReminder } from "@/lib/messaging/send";
import { planReminders, UPCOMING_DAYS, type ReminderKind } from "@/lib/messaging/reminder-plan";
import { captureError } from "@/lib/monitoring";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { forEachActiveOrg } from "@/lib/platform/orgs";
import { withCronRun } from "@/lib/platform/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily maintenance + automated reminder pass. Triggered by Vercel Cron (or
// any scheduler) with `Authorization: Bearer $CRON_SECRET`.
//
// Runs once per ACTIVE company (forEachActiveOrg); every read and send is
// scoped to that company through tenantDb. A company gets automated
// reminders only when it switched them on (autoRemindersEnabled) AND has
// at least one channel set up; each customer needs recorded consent.
//
// What is sent (lib/messaging/reminder-plan.ts), one message per customer
// per day: an overdue reminder, else a "due today" note, else a "due in
// 3 days" note.
//
// Sequencing per party: WhatsApp first; SMS then email only as fallbacks
// when the previous channel FAILED (provider/config error). A gate BLOCK is
// final for the party — the gate rules the party, not the channel.
async function handle(request: NextRequest) {
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
  /** Planned, but the customer has no phone/email for any set-up channel. */
  remindersSkippedNoContact: number;
  byKind: Record<ReminderKind, number>;
  /** Channels this company has set up; empty = nothing was attempted. */
  channels: MessageChannel[];
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
    remindersSkippedNoContact: 0,
    byKind: { overdue: 0, due_today: 0, upcoming: 0 },
    channels: [],
    autoRemindersEnabled: settings?.autoRemindersEnabled ?? false,
  };
  if (!settings?.autoRemindersEnabled) return summary;

  // Only on channels this company has actually set up. A company with
  // no WhatsApp number, and a deployment with no SMS/email transport,
  // sends nothing at all.
  const channels = await configuredChannels(orgId);
  summary.channels = channels;
  if (channels.length === 0) return summary;

  // Open invoices that are overdue, due today, or due in 3 days — for
  // customers who have opted in and are not paused. (The gate re-checks
  // consent and pause on every send; this only avoids pointless work.)
  const now = new Date();
  const horizon = new Date(now.getTime() + (UPCOMING_DAYS + 1) * 24 * 60 * 60 * 1000);
  const invoices = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      dueDate: { lte: horizon },
      party: {
        isActive: true,
        consentStatus: "OPTED_IN",
        outreachPaused: false,
        totalOutstanding: { gt: 0 },
      },
    },
    select: {
      id: true,
      partyId: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      creditedAmount: true,
      party: { select: { phone: true, email: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 5000,
  });
  const contact = new Map(invoices.map((i) => [i.partyId, i.party]));

  const plan = planReminders(
    invoices.map((i) => ({
      id: i.id,
      partyId: i.partyId,
      dueDate: i.dueDate,
      pending: Number(i.totalAmount.minus(i.paidAmount).minus(i.creditedAmount)),
    })),
    now,
    settings.timezone,
  ).slice(0, 500);

  for (const item of plan) {
    const party = contact.get(item.partyId)!;
    const usable = channels.filter((c) => partyReachableOn(c, party));
    if (usable.length === 0) {
      summary.remindersSkippedNoContact++;
      continue;
    }

    let done = false;
    for (const channel of usable) {
      const result = await sendReminder({
        organizationId: orgId,
        partyId: item.partyId,
        channel,
        invoiceId: item.invoiceId,
        sentById: null,
        kind: item.kind,
      });
      if (result.status === "sent") {
        summary.remindersSent++;
        summary.byKind[item.kind]++;
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

// SY40 — records a CronRun row (duration, companies, failures).
export const GET = withCronRun("reminders", handle);
