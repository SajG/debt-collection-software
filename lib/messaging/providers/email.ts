// Email via Resend (env-configured; one deployment per distributor).

import type { ChannelProvider, SendOutcome, SendRequest } from "../types";

export function createEmailProvider(): ChannelProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  return {
    channel: "EMAIL",

    isConfigured() {
      return Boolean(apiKey && from);
    },

    async send(request: SendRequest): Promise<SendOutcome> {
      if (!apiKey || !from) {
        return { ok: false, error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM)" };
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [request.to],
            subject: request.subject ?? "Payment reminder",
            text: request.body,
          }),
        });

        const data = (await res.json()) as { id?: string; message?: string };

        if (!res.ok) {
          return {
            ok: false,
            error: data.message ?? `Resend error (HTTP ${res.status})`,
          };
        }
        return { ok: true, providerMessageId: data.id };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Email request failed",
        };
      }
    },
  };
}
