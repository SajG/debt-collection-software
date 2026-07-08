import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { getLogoSignedUrl } from "@/lib/storage";
import { PageHeader, LinkButton } from "../_components/ui";
import { SettingsForm, type SettingsFormValues } from "./settings-form";

export default async function SettingsPage() {
  const profile = await requireAdmin();

  const settings = await db.businessSettings.findUnique({
    where: { profileId: profile.id },
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
    whatsappPhoneNumberId: settings?.whatsappPhoneNumberId ?? "",
    whatsappBusinessAccountId: settings?.whatsappBusinessAccountId ?? "",
    whatsappTemplateName: settings?.whatsappTemplateName ?? "",
    whatsappApiToken: "", // write-only; the stored token never reaches the client
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

  return (
    <div className="p-8">
      <PageHeader
        title="Settings"
        subtitle="Company details, outreach guardrails, and channel configuration."
        action={
          <LinkButton href="/api/messages/export?format=csv" variant="secondary">
            Export message audit (CSV)
          </LinkButton>
        }
      />
      <SettingsForm
        initial={initial}
        tokenConfigured={Boolean(settings?.whatsappApiToken)}
        bankAccountConfigured={Boolean(settings?.bankAccountNumber)}
        logoUrl={logoUrl}
      />
    </div>
  );
}
