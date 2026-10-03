// Staff-facing WhatsApp sends (daily digests). This is the ONE documented
// exception to "everything goes through sendReminder()": digests go to our
// own staff, not to parties, so the consent gate and Message audit row do
// not apply. Failures are logged by the caller (cron SyncLog).
//
// Meta caveat: free-form text only lands inside the 24h service window —
// each staff member must message the business number once to open it.
// Delivery failure is acceptable: the digest is always visible at /recovery.
import { tenantDb } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";
import { createWhatsAppProvider } from "./providers/whatsapp";

export async function sendStaffWhatsApp(
  organizationId: string,
  to: string,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // SY32 — sent from THIS company's WhatsApp number only.
  const settings = await tenantDb(organizationId).businessSettings.findFirst();
  if (!settings) return { ok: false, error: "Business settings missing" };

  const provider = createWhatsAppProvider({
    phoneNumberId: settings.whatsappPhoneNumberId,
    apiToken: settings.whatsappApiToken ? decryptSecret(settings.whatsappApiToken) : null,
    templateName: settings.whatsappTemplateName,
  });

  const outcome = await provider.send({ to, body, whatsappMessageType: "text" });
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}
