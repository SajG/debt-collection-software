// WhatsApp Cloud API (Meta Graph API) — no BSP SDK; any BSP speaking the
// Cloud API shape can be swapped in behind ChannelProvider.
// Reminders use pre-approved UTILITY-category templates only.

import type { ChannelProvider, SendOutcome, SendRequest } from "../types";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

export type WhatsAppConfig = {
  phoneNumberId: string | null;
  /** Decrypted server-side just before use; never logged. */
  apiToken: string | null;
  templateName: string | null;
};

export function createWhatsAppProvider(config: WhatsAppConfig): ChannelProvider {
  return {
    channel: "WHATSAPP",

    isConfigured() {
      return Boolean(config.phoneNumberId && config.apiToken && config.templateName);
    },

    async send(request: SendRequest): Promise<SendOutcome> {
      // Free-form text needs credentials but no template; it is only valid
      // inside the 24h customer-service window (sendReminder() decides).
      const freeForm = request.whatsappMessageType === "text";
      const configured = freeForm
        ? Boolean(config.phoneNumberId && config.apiToken)
        : this.isConfigured();
      if (!configured) {
        return {
          ok: false,
          error:
            "WhatsApp is not configured (phone number ID, API token, and an approved utility template are required)",
        };
      }

      const payload = freeForm
        ? {
            messaging_product: "whatsapp",
            to: `91${request.to}`, // India country code; parties store 10-digit mobiles
            type: "text",
            text: { body: request.body, preview_url: true },
          }
        : {
            messaging_product: "whatsapp",
            to: `91${request.to}`,
            type: "template",
            template: {
              name: request.templateName ?? config.templateName,
              language: { code: "en" },
              components: [
                {
                  type: "body",
                  parameters: (request.templateParams ?? []).map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ],
            },
          };

      try {
        const res = await fetch(
          `${GRAPH_BASE}/${config.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        const data = (await res.json()) as {
          messages?: { id: string }[];
          error?: { message?: string };
        };

        if (!res.ok) {
          return {
            ok: false,
            error: data.error?.message ?? `WhatsApp API error (HTTP ${res.status})`,
          };
        }
        return { ok: true, providerMessageId: data.messages?.[0]?.id };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "WhatsApp request failed",
        };
      }
    },
  };
}
