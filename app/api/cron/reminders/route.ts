import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { refreshOverdueStatuses } from "@/lib/ar/balance";
import { refreshRiskLevels } from "@/lib/ar/refresh";
import { sendReminder } from "@/lib/messaging/send";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily maintenance + automated reminder pass. Triggered by Vercel Cron (or
// any scheduler) with `Authorization: Bearer $CRON_SECRET`.
//
// Sequencing per party: WhatsApp first; SMS then email only as fallbacks
// when the previous channel FAILED (provider/config error). A gate BLOCK is
// final for the party — the gate rules the party, not the channel.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const overdueMarked = await db.$transaction((tx) => refreshOverdueStatuses(tx));
  const riskUpdated = await refreshRiskLevels();

  const settings = await db.businessSettings.findFirst();
  const summary = {
    overdueMarked,
    riskUpdated,
    remindersSent: 0,
    remindersBlocked: 0,
    remindersFailed: 0,
    autoRemindersEnabled: settings?.autoRemindersEnabled ?? false,
  };

  if (!settings?.autoRemindersEnabled) {
    return NextResponse.json(summary);
  }

  // Only consented, unpaused parties with an overdue invoice. The gate
  // re-checks all of this at send time; the filter just avoids useless work.
  const parties = await db.party.findMany({
    where: {
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
        partyId: party.id,
        channel,
        invoiceId: oldestOverdue?.id ?? null,
        sentById: null, // automated
      });
      if (result.status === "sent") {
        summary.remindersSent++;
        done = true;
        break;
      }
      if (result.status === "blocked") {
        summary.remindersBlocked++;
        done = true;
        break; // gate verdicts are party-level — do not try other channels
      }
      // failed → try next channel
    }
    if (!done) summary.remindersFailed++;
  }

  return NextResponse.json(summary);
}
