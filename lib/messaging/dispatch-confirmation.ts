import { db } from "@/lib/db";
import { statusLinkUrl } from "@/lib/status-link";

// F7 — WhatsApp dispatch confirmation to the customer.
//
// Strictly first-party transactional: sent ONCE per order, when the
// factory advances status to DISPATCHED. Uses Meta's Cloud API with
// a pre-approved utility template.
//
// This module deliberately does NOT reuse the receivables-follow-up
// messaging pipeline (lib/messaging/send.ts, the consent gate, the
// per-party throttles, the STOP-word opt-out flow). Those live under
// a different compliance posture — they're marketing/collections
// follow-ups gated by explicit consent. A dispatch confirmation is
// service-of-order for a transaction the customer initiated; it
// doesn't need consent and shouldn't be gated by outreachPaused.
//
// Failure is best-effort — a WhatsApp send failure never blocks the
// status transition. Logged to SyncLog for debugging.

const META_API_BASE = "https://graph.facebook.com/v20.0";

type SendResult =
  | { skipped: true; reason: string }
  | { ok: true; providerMessageId: string | null }
  | { error: string };

function requireConfig(): {
  token: string;
  phoneNumberId: string;
  templateName: string;
  templateLang: string;
} | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_DISPATCH_TEMPLATE_NAME;
  const templateLang = process.env.WHATSAPP_DISPATCH_TEMPLATE_LANG ?? "en";
  if (!token || !phoneNumberId || !templateName) return null;
  return { token, phoneNumberId, templateName, templateLang };
}

/**
 * Send the dispatch-confirmation utility template to the customer on
 * the order. Idempotent: skips if the order has already been sent one.
 *
 * Trigger point: advanceOrderStatusAction on transition to DISPATCHED
 * (production/actions.ts).
 */
export async function sendDispatchConfirmation(
  orderId: string,
): Promise<SendResult> {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      party: { select: { phone: true, name: true } },
    },
  });
  if (!order) return { skipped: true, reason: "order-not-found" };
  const phone = order.party?.phone;
  if (!phone) return { skipped: true, reason: "no-party-phone" };

  const config = requireConfig();
  if (!config) {
    // No credentials configured — skip cleanly. Distributors who
    // haven't wired Meta yet still get the rest of the app.
    return { skipped: true, reason: "whatsapp-not-configured" };
  }

  // Dedupe — SyncLog rows tagged with sourceId = order.id + type
  // marker. Skips re-send if we already logged one.
  const existing = await db.syncLog.findFirst({
    where: {
      syncType: "EXPORT_PAYMENTS",
      details: { path: ["scope"], equals: `whatsapp-dispatch:${order.id}` },
    },
    select: { id: true },
  });
  if (existing) return { skipped: true, reason: "already-sent" };

  // Template body params. Adjust to match the template you registered
  // in the Meta app; the shape here maps to:
  //   {{1}} order number
  //   {{2}} customer name
  //   {{3}} tracking link
  const trackingUrl = statusLinkUrl(order.id, 30);
  const body = {
    messaging_product: "whatsapp",
    to: `+91${phone}`,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: order.orderNumber },
            { type: "text", text: order.party?.name ?? "Customer" },
            { type: "text", text: trackingUrl },
          ],
        },
      ],
    },
  };

  let providerMessageId: string | null = null;
  try {
    const resp = await fetch(
      `${META_API_BASE}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      await db.syncLog.create({
        data: {
          syncType: "EXPORT_PAYMENTS",
          status: "FAILED",
          errorMessage: `WhatsApp send HTTP ${resp.status}: ${text.slice(0, 400)}`,
          details: { scope: `whatsapp-dispatch:${order.id}` },
        },
      });
      return { error: `Meta returned HTTP ${resp.status}` };
    }
    const json = (await resp.json()) as {
      messages?: { id?: string }[];
    };
    providerMessageId = json.messages?.[0]?.id ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.syncLog.create({
      data: {
        syncType: "EXPORT_PAYMENTS",
        status: "FAILED",
        errorMessage: `WhatsApp fetch failed: ${msg.slice(0, 400)}`,
        details: { scope: `whatsapp-dispatch:${order.id}` },
      },
    });
    return { error: msg };
  }

  await db.syncLog.create({
    data: {
      syncType: "EXPORT_PAYMENTS",
      status: "COMPLETED",
      completedAt: new Date(),
      details: {
        scope: `whatsapp-dispatch:${order.id}`,
        orderNumber: order.orderNumber,
        providerMessageId,
      },
    },
  });
  return { ok: true, providerMessageId };
}
