import { Alert, Linking } from "react-native";
import { t, tn } from "./i18n";

// SY24 — polite reminder text + wa.me deep link.
//
// User-initiated only (Sales rep taps a WhatsApp button on a
// customer row), so no Meta API involvement. The wa.me link opens
// WhatsApp with the pre-filled message and the customer's number;
// the rep can tweak before sending.

export type ReminderInput = {
  partyName: string;
  amount: number;
  daysOverdue: number;
  paymentLinkUrl?: string | null;
  yourName?: string | null;
};

/** Format INR without the ₹ glyph (WhatsApp text). */
function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function buildReminderText(input: ReminderInput): string {
  const firstName = input.partyName?.trim().split(" ")[0];
  const days = Math.max(0, Math.round(input.daysOverdue));
  const amount = `₹${inr(input.amount)}`;
  const lines: string[] = [];
  lines.push(firstName ? t("whatsapp.hello", { name: firstName }) : t("whatsapp.helloNoName"));
  lines.push("");
  lines.push(
    days > 0
      ? tn("whatsapp.pendingFor", days, { amount })
      : t("whatsapp.due", { amount }),
  );
  if (input.paymentLinkUrl) {
    lines.push("");
    lines.push(t("whatsapp.payOnline", { url: input.paymentLinkUrl }));
  }
  lines.push("");
  lines.push(t("whatsapp.whenCanWeExpect"));
  lines.push(t("whatsapp.thanks"));
  if (input.yourName) {
    lines.push(input.yourName);
  }
  return lines.join("\n");
}

/** Open wa.me with the encoded text. Returns false when the deep
 *  link can't be handled (WhatsApp not installed on the device). */
export async function openWhatsApp(
  phoneE164OrLocal: string,
  text: string,
): Promise<boolean> {
  const digits = phoneE164OrLocal.replace(/\D/g, "");
  // wa.me needs international format WITHOUT the +.
  const phone = digits.startsWith("91") ? digits : `91${digits.slice(-10)}`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) throw new Error("no handler");
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(
      t("whatsapp.whatsappNotAvailable"),
      t("whatsapp.installWhatsappOrCopyThe"),
    );
    return false;
  }
}
