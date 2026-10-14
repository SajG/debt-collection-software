// One place for "how do I reach a person". The WhatsApp number is the
// same placeholder the marketing pages use (lib/signup-flag.ts) until
// the owner supplies the real support line; set
// NEXT_PUBLIC_SUPPORT_WHATSAPP (digits with country code, e.g.
// 9198XXXXXXXX) to replace it everywhere at once.

export const SUPPORT_EMAIL = "support@getsyncit.app";

const number = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "") || "919999999999";

export function supportWhatsAppUrl(message = "Hi Syncit team, I need help with"): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
