import { NextResponse, type NextRequest } from "next/server";
import { tenantDb } from "@/lib/tenant";
import { captureError } from "@/lib/monitoring";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { forEachActiveOrg } from "@/lib/platform/orgs";
import { sendEmail } from "@/lib/email/send";
import { weeklySummaryEmail } from "@/lib/email/templates";
import { loadFollowUps } from "@/lib/recovery/followups";
import { istMonthKey, istMonthWindow } from "@/lib/recovery/targets";
import { buildWeeklySummary, weeklySummaryIsEmpty } from "@/lib/recovery/weekly";
import { withCronRun } from "@/lib/platform/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SY29 — Monday 9:00 IST (03:30 UTC, vercel.json) email to each
// company's managers: total outstanding, overdue and how it moved since
// last Monday, money received this month against target, the ten most
// overdue customers and the payment promises that were missed.
//
// Per company (forEachActiveOrg + tenantDb): figures, customers and
// recipients all come from that one company. Recipients are its active
// ADMIN members with an email address. A company with nothing owed and
// nothing received gets no email.

type OrgSummary = { orgId: string; orgSlug: string; skipped: "empty" | "no_recipients" | null; sent: number; failed: number };

async function runForOrg(orgId: string, orgSlug: string, orgName: string, now: Date): Promise<OrgSummary> {
  const db = tenantDb(orgId);
  const out: OrgSummary = { orgId, orgSlug, skipped: null, sent: 0, failed: 0 };

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthKey = istMonthKey(now);
  const month = istMonthWindow(monthKey);

  const [parties, invoices, payments, targets, followUps] = await Promise.all([
    db.party.findMany({
      where: { isActive: true },
      select: { id: true, name: true, totalOutstanding: true, assignedTo: { select: { ownerName: true } } },
    }),
    // Past-due invoices that are still open, or were touched in the
    // last week (so last Monday's position can be rebuilt).
    db.invoice.findMany({
      where: {
        status: { not: "CANCELLED" },
        dueDate: { lt: now },
        OR: [{ status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } }, { updatedAt: { gte: weekAgo } }],
      },
      select: {
        partyId: true,
        dueDate: true,
        totalAmount: true,
        payments: { select: { paymentDate: true, amount: true } },
        creditNotes: { where: { status: { not: "CANCELLED" } }, select: { issuedAt: true, amount: true } },
      },
    }),
    db.payment.findMany({
      where: { paymentDate: { gte: month.start, lt: month.end } },
      select: { paymentDate: true, amount: true },
    }),
    db.recoveryTarget.findMany({ where: { month: monthKey }, select: { targetAmount: true } }),
    loadFollowUps(db, now),
  ]);

  const broken = [...followUps.unassigned, ...Array.from(followUps.byStaff.values()).flat()].filter(
    (f) => f.brokenPromise && f.promiseDate,
  );

  const summary = buildWeeklySummary({
    now,
    parties: parties.map((p) => ({
      id: p.id,
      name: p.name,
      outstanding: Number(p.totalOutstanding),
      salesperson: p.assignedTo?.ownerName ?? null,
    })),
    invoices: invoices.map((i) => ({
      partyId: i.partyId,
      dueDate: i.dueDate,
      totalAmount: Number(i.totalAmount),
      settlements: [
        ...i.payments.map((p) => ({ at: p.paymentDate, amount: Number(p.amount) })),
        ...i.creditNotes.map((c) => ({ at: c.issuedAt, amount: Number(c.amount) })),
      ],
    })),
    paymentsThisMonth: payments.map((p) => ({ at: p.paymentDate, amount: Number(p.amount) })),
    monthTarget: targets.reduce((s, t) => s + Number(t.targetAmount), 0),
    brokenPromises: broken.map((f) => ({
      partyId: f.partyId,
      promiseDate: new Date(f.promiseDate!),
      promiseAmount: f.promiseAmount,
    })),
  });
  if (weeklySummaryIsEmpty(summary)) {
    out.skipped = "empty";
    return out;
  }

  const managers = await db.membership.findMany({
    where: { isActive: true, role: "ADMIN" },
    select: { profile: { select: { ownerName: true, email: true, isActive: true, deletedAt: true } } },
  });
  const recipients = managers
    .map((m) => m.profile)
    .filter((p) => p.email && p.isActive && !p.deletedAt);
  if (recipients.length === 0) {
    out.skipped = "no_recipients";
    return out;
  }

  for (const r of recipients) {
    const mail = weeklySummaryEmail({
      managerName: r.ownerName,
      companyName: orgName,
      weekOf: now,
      summary,
    });
    const res = await sendEmail({ to: r.email!, ...mail });
    if (res.ok) out.sent++;
    else out.failed++;
  }
  return out;
}

async function handle(request: NextRequest) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  try {
    const now = new Date();
    const { ok, failed } = await forEachActiveOrg("cron.weekly-summary", (org) =>
      runForOrg(org.id, org.slug, org.name, now),
    );
    return NextResponse.json({
      orgsProcessed: ok.length,
      orgsFailed: failed.length,
      perOrg: ok.map((r) => r.result),
    });
  } catch (e) {
    await captureError(e, { scope: "cron.weekly-summary" });
    return NextResponse.json({ error: "Cron pass failed" }, { status: 500 });
  }
}

// SY40 — records a CronRun row (duration, companies, failures).
export const GET = withCronRun("weekly-summary", handle);
