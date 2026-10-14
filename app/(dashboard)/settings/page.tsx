import { tenantDb } from "@/lib/tenant";
import { requireAdmin } from "@/lib/authz";
import { getLogoSignedUrl } from "@/lib/storage";
import { PageHeader, LinkButton, Card } from "../_components/ui";
import { SettingsForm, type SettingsFormValues } from "./settings-form";
import { ReferralLink } from "./referral-card";
import { referralSummary } from "@/lib/platform/referrals";

const EXPORT_ENTITIES = [
  "parties",
  "invoices",
  "payments",
  "actions",
  "credit-notes",
  "proformas",
] as const;

export default async function SettingsPage() {
  const profile = await requireAdmin();
  const db = tenantDb(profile.organizationId);

  // SY21 — BusinessSettings is 1:1 with Organization now.
  const organizationId = profile.organizationId;
  const settings = await db.businessSettings.findUnique({
    where: { organizationId },
  });

  const initial: SettingsFormValues = {
    companyGstNumber: settings?.companyGstNumber ?? "",
    companyAddress: settings?.companyAddress ?? "",
    companyState: settings?.companyState ?? "",
    companyCityPin: settings?.companyCityPin ?? "",
    defaultCreditDays: settings?.defaultCreditDays?.toString() ?? "",
    timezone: settings?.timezone ?? "Asia/Kolkata",
    quietHoursStart: (settings?.quietHoursStart ?? 8).toString(),
    quietHoursEnd: (settings?.quietHoursEnd ?? 19).toString(),
    maxMessagesPerDay: (settings?.maxMessagesPerDay ?? 1).toString(),
    maxMessagesPerWeek: (settings?.maxMessagesPerWeek ?? 3).toString(),
    autoRemindersEnabled: settings?.autoRemindersEnabled ?? false,
    orderApprovalMode: settings?.orderApprovalMode ?? "EXCEPTIONS_ONLY",
    requireApprovalForAllOrders:
      settings?.requireApprovalForAllOrders ?? true,
    requireAppLock: settings?.requireAppLock ?? false,
    whatsappPhoneNumberId: settings?.whatsappPhoneNumberId ?? "",
    whatsappBusinessAccountId: settings?.whatsappBusinessAccountId ?? "",
    whatsappTemplateName: settings?.whatsappTemplateName ?? "",
    whatsappApiToken: "", // write-only; the stored token never reaches the client
    // write-only; stored Razorpay keys never reach the client
    razorpayKeyId: "",
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
    bankAccountName: settings?.bankAccountName ?? "",
    bankAccountNumber: "", // write-only; the stored number never reaches the client
    bankIfscCode: settings?.bankIfscCode ?? "",
    bankName: settings?.bankName ?? "",
    bankBranch: settings?.bankBranch ?? "",
    invoicePrefix: settings?.invoicePrefix ?? "",
    authorizedSignatoryName: settings?.authorizedSignatoryName ?? "",
  };

  const logoUrl = settings?.companyLogoPath
    ? await getLogoSignedUrl(settings.companyLogoPath)
    : null;

  // SY38 — "Invite another business". Owner only: the reward is a
  // month off this company's own bill.
  const referral = profile.isOwner ? await referralSummary(organizationId) : null;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://getsyncit.app").replace(/\/+$/, "");

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Settings"
        subtitle="Company details, outreach guardrails, and channel configuration."
        action={
          <LinkButton href="/api/messages/export?format=csv" variant="secondary">
            Export message audit (CSV)
          </LinkButton>
        }
      />
      <div className="mb-6">
        <Card title="Data export & backup">
          <p className="mb-3 text-sm text-muted-foreground">
            Download your data for your own records or to move it elsewhere.
            The message audit trail has its own export above.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {EXPORT_ENTITIES.map((e) => (
              <a
                key={e}
                href={`/api/data/export?entity=${e}&format=csv`}
                className="text-primary hover:underline"
                download
              >
                {e.replace("-", " ")} (CSV)
              </a>
            ))}
            <a
              href="/api/data/export?entity=all&format=json"
              className="font-medium text-primary hover:underline"
              download
            >
              Everything (JSON)
            </a>
          </div>
        </Card>
      </div>
      {profile.isOwner && (
        <div className="mb-6">
          <Card title="Company">
            <p className="text-sm text-muted-foreground">
              Download all data, transfer ownership, or delete the company —{" "}
              <a href="/settings/company" className="text-primary hover:underline">
                Settings → Company
              </a>
              .
            </p>
          </Card>
        </div>
      )}
      {referral && (
        <div className="mb-6">
          <Card title="Invite another business">
            <p className="mb-3 text-sm text-muted-foreground">
              Know a manufacturer or distributor who would use Syncit? Send
              them this link. When they pay for their first month, you both
              get one month free.
            </p>
            <ReferralLink url={`${appUrl}/r/${referral.code}`} />
            <p className="mt-3 text-sm text-muted-foreground">
              Code <span className="font-mono text-foreground">{referral.code}</span>
              {" · "}
              {referral.signedUp} signed up
              {" · "}
              {referral.rewarded} free {referral.rewarded === 1 ? "month" : "months"} earned
              {referral.pendingManual > 0
                ? ` (${referral.pendingManual} being applied by our team)`
                : ""}
            </p>
          </Card>
        </div>
      )}
      <SettingsForm
        initial={initial}
        tokenConfigured={Boolean(settings?.whatsappApiToken)}
        bankAccountConfigured={Boolean(settings?.bankAccountNumber)}
        razorpayConfigured={Boolean(settings?.razorpayKeyId && settings?.razorpayKeySecret)}
        logoUrl={logoUrl}
      />
    </div>
  );
}
