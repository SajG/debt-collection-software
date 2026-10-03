import { NextResponse, type NextRequest } from "next/server";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { captureError } from "@/lib/monitoring";
import { sendEmail } from "@/lib/email/send";
import { paymentLockedEmail, trialEndingSoonEmail, trialEndedEmail } from "@/lib/email/templates";
import {
  listTrialsEndingBetween,
  lockEndedCancellations,
  lockExpiredPastDue,
  lockExpiredTrials,
} from "@/lib/platform/billing";
import { PAST_DUE_GRACE_DAYS } from "@/lib/billing/events";

// SY23 — nightly trial lifecycle mails.
//
// One pass:
//   * Organizations with plan=TRIAL and trialEndsAt in the next 3
//     days (± 6-hour window) → "3 days left" email to the owner.
//   * Organizations with plan=TRIAL and trialEndsAt < now that
//     aren't LOCKED yet → status LOCKED (read-only, SY28) + "trial
//     ended" email. Nothing is deleted; sign-in, viewing and export
//     keep working. Subscribing flips the org back to ACTIVE via the
//     razorpay-billing webhook.
//   * SY34: PAST_DUE (failed renewal) for 7 days → LOCKED + email.
//   * SY34: cancelled subscriptions whose paid period has ended →
//     LOCKED. Billing-exempt orgs (Synergy) are never touched.

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
    pastDueLocked: 0,
    cancellationsEnded: 0,
    errors: 0,
  };

  // Ending in ~3 days
  const soon = await listTrialsEndingBetween(in3daysMin, in3daysMax);
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

  // Ended → LOCKED (read-only). Billing-exempt orgs are skipped.
  const ended = await lockExpiredTrials(now);
  for (const org of ended) {
    summary.lockedOut++;
    const owner = org.memberships[0]?.profile;
    if (!owner?.email) continue;
    const tmpl = trialEndedEmail({
      ownerName: owner.ownerName,
      companyName: org.name,
    });
    const res = await sendEmail({ to: owner.email, ...tmpl });
    if (res.ok) summary.endedNotified++;
    else summary.errors++;
  }

  // Failed renewal not fixed within the grace period → read-only.
  const pastDue = await lockExpiredPastDue(now, PAST_DUE_GRACE_DAYS);
  for (const org of pastDue) {
    summary.pastDueLocked++;
    const owner = org.memberships[0]?.profile;
    if (!owner?.email) continue;
    const res = await sendEmail({
      to: owner.email,
      ...paymentLockedEmail({ ownerName: owner.ownerName, companyName: org.name }),
    });
    if (!res.ok) summary.errors++;
  }

  // Cancelled at period end, and the period is over → read-only.
  summary.cancellationsEnded = (await lockEndedCancellations(now)).length;

  return NextResponse.json(summary);
}
