import type { SignupLead } from "@prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/monitoring";
import { capture } from "@/lib/analytics-events/posthog";
import { recordOnce } from "@/lib/platform/milestones";
import { attachReferral } from "@/lib/platform/referrals";
import { provisionCompany } from "@/lib/platform/signup";
import { completeLead } from "@/lib/platform/leads";

// SY42 — turns a verified sign-up lead into a company. Shared by the
// auth callback (password sign-up, after the email link is clicked) and
// /signup/complete (Google sign-up). Idempotent per lead: a completed
// lead is never provisioned twice.

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

function sourceOf(lead: SignupLead): string {
  if (lead.referralCode) return "referral";
  if (lead.utmSource) return lead.utmMedium ? `${lead.utmSource}/${lead.utmMedium}` : lead.utmSource;
  if (lead.gclid) return "google/ads";
  if (lead.fbclid) return "facebook/ads";
  if (lead.referrer) return lead.referrer.split("/")[0]!;
  return "direct";
}

export async function provisionFromLead(params: {
  userId: string;
  lead: SignupLead;
  appMetadata?: Record<string, unknown> | null;
}): Promise<{ organizationId: string }> {
  const { userId, lead } = params;
  if (lead.status === "COMPLETED" && lead.organizationId) {
    return { organizationId: lead.organizationId };
  }
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const org = await provisionCompany({
    userId,
    companyName: lead.companyName,
    ownerName: lead.ownerName,
    phone: lead.phone ?? "",
    email: lead.email,
    slug: `${slugify(lead.companyName)}-${userId.slice(0, 6)}`,
    trialEndsAt,
    company: {
      gstin: lead.gstin,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      pincode: lead.pincode,
      industry: lead.industry,
      teamSize: lead.teamSize,
      signupSource: sourceOf(lead),
    },
  });
  await completeLead(lead.id, org.id);

  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...(params.appMetadata ?? {}), active_org_id: org.id },
  });

  try {
    const referred = await attachReferral(org.id, lead.referralCode ?? undefined);
    await recordOnce(org.id, "milestone:company_created");
    await capture({ event: "signup_completed", profileId: userId, organizationId: org.id, properties: { referred, source: sourceOf(lead), method: lead.authMethod } });
    await capture({ event: "company_created", profileId: userId, organizationId: org.id, properties: { plan: "trial", referred } });
    await recordOnce(org.id, "email:day0_welcome");
  } catch (e) {
    await captureError(e, { scope: "signup.analytics" });
  }

  void (async () => {
    try {
      const { sendEmail } = await import("@/lib/email/send");
      const { welcomeEmail } = await import("@/lib/email/templates");
      await sendEmail({
        to: lead.email,
        ...welcomeEmail({
          ownerName: lead.ownerName,
          companyName: lead.companyName,
          trialEndsAt,
        }),
      });
    } catch (e) {
      await captureError(e, { scope: "signup.welcome-email" });
    }
  })();

  return { organizationId: org.id };
}
