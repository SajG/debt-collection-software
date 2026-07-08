import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { getLogoSignedUrl } from "@/lib/storage";
import { PageHeader, LinkButton, Card } from "../_components/ui";
import { SettingsForm, type SettingsFormValues } from "./settings-form";

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
      <SettingsForm
        initial={initial}
        tokenConfigured={Boolean(settings?.whatsappApiToken)}
        bankAccountConfigured={Boolean(settings?.bankAccountNumber)}
        logoUrl={logoUrl}
      />
    </div>
  );
}
