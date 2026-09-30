import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { captureError } from "@/lib/monitoring";
import { sendEmail } from "@/lib/email/send";
import { trialEndingSoonEmail, trialEndedEmail } from "@/lib/email/templates";

// SY23 — nightly trial lifecycle mails.
//
// One pass:
//   * Organizations with plan=TRIAL and trialEndsAt in the next 3
//     days (± 6-hour window) → "3 days left" email to the owner.
//   * Organizations with plan=TRIAL and trialEndsAt < now that
//     haven't been marked PAST_DUE yet → "trial ended" email + flip
//     status to PAST_DUE so the platform-level access gate can bite.
//
// We do NOT lock users out here; that lives in requireProfile once
// PAST_DUE is honoured (SY24). This job only emails + stamps.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    await captureError(e, { scope: "cron.trial-reminders" });
    return NextResponse.json({ error: "Cron pass failed" }, { status: 500 });
  }
}

async function run() {
  const now = new Date();
  const in3days = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const in3daysMin = new Date(now.getTime() + (3 * 24 - 6) * 3600 * 1000);
  const in3daysMax = new Date(now.getTime() + (3 * 24 + 6) * 3600 * 1000);

  const summary = {
    endingSoonNotified: 0,
    endedNotified: 0,
    lockedOut: 0,
    errors: 0,
  };

  // Ending in ~3 days
  const soon = await db.organization.findMany({
    where: {
      plan: "TRIAL",
      status: "ACTIVE",
      trialEndsAt: { gte: in3daysMin, lte: in3daysMax },
    },
    select: {
      id: true,
      name: true,
      trialEndsAt: true,
      memberships: {
        where: { isOwner: true, isActive: true },
        select: {
          profile: { select: { email: true, ownerName: true } },
        },
        take: 1,
      },
    },
  });
  for (const org of soon) {
    const owner = org.memberships[0]?.profile;
    if (!owner?.email || !org.trialEndsAt) continue;
    const daysLeft = Math.max(
      1,
      Math.round((org.trialEndsAt.getTime() - now.getTime()) / (24 * 3600 * 1000)),
    );
    const tmpl = trialEndingSoonEmail({
      ownerName: owner.ownerName,
      companyName: org.name,
      daysLeft,
      trialEndsAt: org.trialEndsAt,
    });
    const res = await sendEmail({ to: owner.email, ...tmpl });
    if (res.ok) summary.endingSoonNotified++;
    else summary.errors++;
  }

  // Ended
  const ended = await db.organization.findMany({
    where: {
      plan: "TRIAL",
      status: "ACTIVE",
      trialEndsAt: { lt: now },
    },
    select: {
      id: true,
      name: true,
      memberships: {
        where: { isOwner: true, isActive: true },
        select: { profile: { select: { email: true, ownerName: true } } },
        take: 1,
      },
    },
  });
  for (const org of ended) {
    const owner = org.memberships[0]?.profile;
    if (owner?.email) {
      const tmpl = trialEndedEmail({
        ownerName: owner.ownerName,
        companyName: org.name,
      });
      const res = await sendEmail({ to: owner.email, ...tmpl });
      if (res.ok) summary.endedNotified++;
      else summary.errors++;
    }
    await db.organization.update({
      where: { id: org.id },
      data: { status: "PAST_DUE" },
    });
    summary.lockedOut++;
  }

  return NextResponse.json(summary);
}
