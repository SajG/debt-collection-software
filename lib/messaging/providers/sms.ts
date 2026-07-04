// SMS via MSG91 (env-configured; one deployment per distributor).

import type { ChannelProvider, SendOutcome, SendRequest } from "../types";

export function createSmsProvider(): ChannelProvider {
  const authKey = process.env.MSG91_AUTH_KEY;
  const senderId = process.env.MSG91_SENDER_ID;

  return {
    channel: "SMS",

    isConfigured() {
      return Boolean(authKey && senderId);
    },

    async send(request: SendRequest): Promise<SendOutcome> {
      if (!authKey || !senderId) {
        return { ok: false, error: "SMS is not configured (MSG91_AUTH_KEY / MSG91_SENDER_ID)" };
      }

      try {
        const res = await fetch("https://control.msg91.com/api/v2/sendsms", {
          method: "POST",
          headers: {
            authkey: authKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: senderId,
            route: "4", // transactional
            country: "91",
            sms: [{ message: request.body, to: [request.to] }],
          }),
        });

        const data = (await res.json()) as {
          type?: string;
          message?: string;
        };

        if (!res.ok || data.type === "error") {
          return {
            ok: false,
            error: data.message ?? `MSG91 error (HTTP ${res.status})`,
          };
        }
        return { ok: true, providerMessageId: data.message };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "SMS request failed",
        };
      }
    },
  };
}
