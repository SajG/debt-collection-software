// THE single outbound send path. Every reminder — manual "send now" clicks,
// the cron pass, and any future AI-drafted message — goes through
// sendReminder(), which runs the deterministic gate (lib/messaging/gate.ts)
// and writes an audit Message row for every attempt, including blocked ones.
// Nothing else in the codebase may call a ChannelProvider directly.

import { subDays } from "date-fns";
import type { MessageChannel, Party, BusinessSettings } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { formatINR, formatDate } from "@/lib/format";
import { getOrCreatePaymentLink, razorpayConfigured } from "@/lib/payments/razorpay";
import { evaluateGate } from "./gate";
import type { ChannelProvider } from "./types";
import { createWhatsAppProvider } from "./providers/whatsapp";
import { createSmsProvider } from "./providers/sms";
import { createEmailProvider } from "./providers/email";

export type SendReminderParams = {
  partyId: string;
  channel: MessageChannel;
  /** Attach the reminder to a specific invoice (payment link + template params). */
  invoiceId?: string | null;
  /** Profile id for manual sends; null for the automated cron pass. */
  sentById: string | null;
};

export type SendReminderResult =
  | { status: "sent"; messageId: string }
  | { status: "blocked"; reason: string }
  | { status: "failed"; error: string };

async function resolveProvider(
  channel: MessageChannel,
  settings: BusinessSettings
): Promise<ChannelProvider> {
  switch (channel) {
    case "WHATSAPP":
      return createWhatsAppProvider({
        phoneNumberId: settings.whatsappPhoneNumberId,
        apiToken: settings.whatsappApiToken
          ? decryptSecret(settings.whatsappApiToken)
          : null,
        templateName: settings.whatsappTemplateName,
      });
    case "SMS":
      return createSmsProvider();
    case "EMAIL":
      return createEmailProvider();
  }
}

function destinationFor(channel: MessageChannel, party: Party): string | null {
  return channel === "EMAIL" ? party.email : party.phone;
}

export async function sendReminder(
  params: SendReminderParams
): Promise<SendReminderResult> {
  const [party, settings] = await Promise.all([
    db.party.findUnique({ where: { id: params.partyId } }),
    db.businessSettings.findFirst(),
  ]);
  if (!party) return { status: "failed", error: "Party not found" };
  if (!settings) return { status: "failed", error: "Business settings missing" };

  const invoice = params.invoiceId
    ? await db.invoice.findUnique({ where: { id: params.invoiceId } })
    : null;
  if (params.invoiceId && (!invoice || invoice.partyId !== party.id)) {
    return { status: "failed", error: "Invoice not found for this party" };
  }

  const businessName =
    (await db.profile.findFirst({ where: { role: "ADMIN" } }))?.businessName ??
    "your supplier";

  // ── The gate. No caller can skip this. ─────────────────────────
  const recent = await db.message.findMany({
    where: {
      partyId: party.id,
      direction: "OUTBOUND",
      status: { in: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"] },
      createdAt: { gte: subDays(new Date(), 7) },
    },
    select: { createdAt: true, status: true },
  });

  const gate = evaluateGate({
    party: {
      consentStatus: party.consentStatus,
      outreachPaused: party.outreachPaused,
    },
    settings: {
      timezone: settings.timezone,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      maxMessagesPerDay: settings.maxMessagesPerDay,
      maxMessagesPerWeek: settings.maxMessagesPerWeek,
    },
    recentOutboundAt: recent
      .filter((m) => m.status !== "FAILED")
      .map((m) => m.createdAt),
    recentFailedAt: recent
      .filter((m) => m.status === "FAILED")
      .map((m) => m.createdAt),
  });

  const pending = invoice
    ? Number(invoice.totalAmount.minus(invoice.paidAmount))
    : Number(party.totalOutstanding);
  const pendingText = formatINR(pending);
  const invoiceText = invoice ? `invoice ${invoice.invoiceNumber}` : "your account";
  const dueText = invoice ? ` (due ${formatDate(invoice.dueDate)})` : "";

  if (!gate.allowed) {
    const blocked = await db.message.create({
      data: {
        partyId: party.id,
        invoiceId: invoice?.id ?? null,
        channel: params.channel,
        direction: "OUTBOUND",
        status: "BLOCKED",
        body: `[not sent] Reminder for ${invoiceText}, ${pendingText}`,
        gateResult: gate.reason,
        sentById: params.sentById,
      },
    });
    void blocked;
    return { status: "blocked", reason: gate.reason };
  }

  const to = destinationFor(params.channel, party);
  if (!to) {
    await db.message.create({
      data: {
        partyId: party.id,
        invoiceId: invoice?.id ?? null,
        channel: params.channel,
        direction: "OUTBOUND",
        status: "FAILED",
        body: `[not sent] Reminder for ${invoiceText}, ${pendingText}`,
        error: `Party has no ${params.channel === "EMAIL" ? "email address" : "phone number"}`,
        sentById: params.sentById,
      },
    });
    return {
      status: "failed",
      error: `Party has no ${params.channel === "EMAIL" ? "email address" : "phone number"} on file`,
    };
  }

  // Payment link (best-effort — reminder still goes out without one).
  let paymentLinkUrl: string | null = null;
  if (razorpayConfigured() && pending > 0) {
    const link = await getOrCreatePaymentLink({
      partyId: party.id,
      invoiceId: invoice?.id ?? null,
      amount: pending,
      partyName: party.name,
      phone: party.phone,
      email: party.email,
      description: `Payment for ${invoiceText} — ${businessName}`,
    });
    if (link.ok) paymentLinkUrl = link.shortUrl;
  }

  const linkText = paymentLinkUrl ? ` Pay securely: ${paymentLinkUrl}` : "";
  const body =
    `Dear ${party.name}, this is a payment reminder from ${businessName}. ` +
    `${invoiceText[0].toUpperCase()}${invoiceText.slice(1)}${dueText} has ` +
    `${pendingText} pending.${linkText} Reply STOP to opt out.`;

  const provider = await resolveProvider(params.channel, settings);
  const outcome = await provider.send({
    to,
    body,
    subject: `Payment reminder — ${invoiceText} (${pendingText})`,
    templateName: settings.whatsappTemplateName ?? undefined,
    templateParams: [
      party.name,
      businessName,
      invoice?.invoiceNumber ?? "outstanding balance",
      pendingText,
      invoice ? formatDate(invoice.dueDate) : "now",
      paymentLinkUrl ?? "-",
    ],
  });

  const message = await db.message.create({
    data: {
      partyId: party.id,
      invoiceId: invoice?.id ?? null,
      channel: params.channel,
      direction: "OUTBOUND",
      status: outcome.ok ? "SENT" : "FAILED",
      templateName: params.channel === "WHATSAPP" ? settings.whatsappTemplateName : null,
      body,
      providerMessageId: outcome.ok ? outcome.providerMessageId ?? null : null,
      error: outcome.ok ? null : outcome.error,
      paymentLinkUrl,
      sentById: params.sentById,
      sentAt: outcome.ok ? new Date() : null,
    },
  });

  return outcome.ok
    ? { status: "sent", messageId: message.id }
    : { status: "failed", error: outcome.error };
}
