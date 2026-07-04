import type { MessageChannel } from "@prisma/client";

export type SendRequest = {
  /** Destination: 10-digit Indian mobile (WhatsApp/SMS) or email address. */
  to: string;
  /** Rendered message text (SMS/email body; WhatsApp fallback preview). */
  body: string;
  /** Email subject; ignored by other channels. */
  subject?: string;
  /** Pre-approved utility template name (WhatsApp only). */
  templateName?: string;
  /** Positional template parameters (WhatsApp only). */
  templateParams?: string[];
};

export type SendOutcome =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string };

/**
 * One outbound channel behind a common shape so WhatsApp BSPs, SMS gateways,
 * and email providers are swappable. Providers do NOT decide whether a
 * message may be sent — that is the gate's job in sendReminder(); they only
 * transport it.
 */
export interface ChannelProvider {
  readonly channel: MessageChannel;
  /** False when required credentials are missing — send fails closed. */
  isConfigured(): boolean;
  send(request: SendRequest): Promise<SendOutcome>;
}
