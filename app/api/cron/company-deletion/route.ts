import { NextResponse, type NextRequest } from "next/server";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { captureError } from "@/lib/monitoring";
import { sendEmail } from "@/lib/email/send";
import { companyDeletionReminderEmail } from "@/lib/email/templates";
import {
  companiesDueForPurge,
  purgeCompany,
  takeDeletionReminders,
} from "@/lib/platform/company-deletion";

// SY35 — nightly company-deletion pass.
//   * DELETING companies 5 days from their purge date (day 25) → reminder
//     email to the owner (once).
//   * DELETING companies past their purge date → purgeCompany(): all rows
//     for the organizationId + storage objects under <organizationId>/.
//     One company's failure never blocks the next; a partial purge is
//     re-run safely the next night.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const now = new Date();
  const summary = { reminded: 0, purged: 0, failed: 0 };

  for (const org of await takeDeletionReminders(now)) {
    const owner = org.memberships[0]?.profile;
    if (!owner?.email || !org.deletionScheduledFor) continue;
    const res = await sendEmail({
      to: owner.email,
      ...companyDeletionReminderEmail({
        ownerName: owner.ownerName,
        companyName: org.name,
        scheduledFor: org.deletionScheduledFor,
      }),
    });
    if (res.ok) summary.reminded++;
  }

  for (const { id } of await companiesDueForPurge(now)) {
    try {
      await purgeCompany(id, now);
      summary.purged++;
    } catch (e) {
      summary.failed++;
      await captureError(e, { scope: "cron.company-deletion.purge", orgId: id });
    }
  }

  return NextResponse.json(summary);
}
