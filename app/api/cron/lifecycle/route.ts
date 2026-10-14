import { NextResponse, type NextRequest } from "next/server";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { captureError } from "@/lib/monitoring";
import { sendEmail } from "@/lib/email/send";
import {
  connectDataEmail,
  inviteTeamEmail,
  welcomeEmail,
  winBackEmail,
} from "@/lib/email/templates";
import {
  dueLifecycleEmail,
  forgetLifecycleEmail,
  listLifecycleOrgs,
  listOrgIdsForMilestones,
  type LifecycleEmail,
} from "@/lib/platform/lifecycle";
import { recordOnce, syncMilestones } from "@/lib/platform/milestones";
import { unsubscribeUrl } from "@/lib/unsubscribe-link";
import { TRIAL_DAYS } from "@/lib/plans";
import { withCronRun } from "@/lib/platform/cron-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SY38 — the one daily lifecycle pass (04:15 UTC, vercel.json).
//
//   1. Milestones: for every live company, record what it has newly
//      done (first order, first payment, Tally connected, team invited)
//      and send the matching PostHog event. This is the catch-up for
//      anything that happened on the phone or through Tally.
//   2. Emails: for companies up to 40 days old, send the one lifecycle
//      email that is due today (lib/platform/lifecycle.ts), to the
//      owner, at most once per company, skipping any step already done.
//
// Test mode — sends nothing to customers and writes nothing:
//   ?preview=you@example.com   all four emails, as they would look, to
//                              that address
//   ?dryRun=1                  JSON list of what today's run WOULD send

function render(key: LifecycleEmail, org: { id: string; name: string; trialEndsAt: Date | null }, ownerName: string) {
  const common = { ownerName, companyName: org.name, unsubscribeUrl: unsubscribeUrl(org.id) };
  switch (key) {
    case "day0_welcome":
      return welcomeEmail({
        ownerName,
        companyName: org.name,
        trialEndsAt: org.trialEndsAt ?? new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      });
    case "day1_connect_data":
      return connectDataEmail(common);
    case "day3_invite_team":
      return inviteTeamEmail(common);
    case "day30_win_back":
      return winBackEmail(common);
  }
}

async function handle(request: NextRequest) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const url = new URL(request.url);
  const preview = url.searchParams.get("preview");
  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    if (preview) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(preview)) {
        return NextResponse.json({ error: "preview must be an email address" }, { status: 400 });
      }
      const sample = { id: "00000000-0000-4000-8000-000000000000", name: "Sample Traders", trialEndsAt: null };
      const results: Record<string, string> = {};
      for (const key of ["day0_welcome", "day1_connect_data", "day3_invite_team", "day30_win_back"] as const) {
        const mail = render(key, sample, "Asha");
        const res = await sendEmail({ to: preview, ...mail, subject: `[TEST ${key}] ${mail.subject}` });
        results[key] = res.ok ? "sent" : res.error;
      }
      return NextResponse.json({ preview, results });
    }

    const now = new Date();
    const summary = {
      milestonesRecorded: 0,
      sent: {} as Record<string, number>,
      wouldSend: [] as { org: string; email: string }[],
      skippedNoOwnerEmail: 0,
      errors: 0,
    };

    if (!dryRun) {
      for (const orgId of await listOrgIdsForMilestones()) {
        try {
          summary.milestonesRecorded += (await syncMilestones(orgId, { source: "cron" })).length;
        } catch (e) {
          summary.errors++;
          await captureError(e, { scope: "cron.lifecycle.milestones", orgId });
        }
      }
    }

    for (const org of await listLifecycleOrgs(now)) {
      const key = dueLifecycleEmail({
        ageDays: (now.getTime() - org.createdAt.getTime()) / (24 * 60 * 60 * 1000),
        plan: org.plan,
        status: org.status,
        lockReason: org.lockReason,
        billingExempt: org.billingExempt,
        optedOut: org.marketingEmailsOptOut,
        milestones: new Set(org.events.filter((k) => k.startsWith("milestone:")).map((k) => k.slice(10))),
        sent: new Set(org.events.filter((k) => k.startsWith("email:")).map((k) => k.slice(6))),
      });
      if (!key) continue;
      if (dryRun) {
        summary.wouldSend.push({ org: org.id, email: key });
        continue;
      }
      if (!org.owner?.email) {
        summary.skippedNoOwnerEmail++;
        continue;
      }
      // Claim first, so two overlapping runs cannot both send.
      if (!(await recordOnce(org.id, `email:${key}`))) continue;
      const mail = render(key, org, org.owner.ownerName);
      const unsubscribe = unsubscribeUrl(org.id);
      const res = await sendEmail({
        to: org.owner.email,
        ...mail,
        ...(key === "day0_welcome"
          ? {}
          : {
              headers: {
                "List-Unsubscribe": `<${unsubscribe}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }),
      });
      if (res.ok) {
        summary.sent[key] = (summary.sent[key] ?? 0) + 1;
      } else {
        // Not delivered — release the claim so tomorrow's run retries
        // (the window for each email is several days wide).
        summary.errors++;
        await forgetLifecycleEmail(org.id, key);
      }
    }
    return NextResponse.json(summary);
  } catch (e) {
    await captureError(e, { scope: "cron.lifecycle" });
    return NextResponse.json({ error: "Cron pass failed" }, { status: 500 });
  }
}

// SY40 — records a CronRun row (duration, companies, failures).
export const GET = withCronRun("lifecycle", handle);
