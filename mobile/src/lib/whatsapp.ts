import { Alert, Linking } from "react-native";

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
  const nameGreet = input.partyName?.split(" ")[0] ?? "Sir";
  const days = Math.max(0, Math.round(input.daysOverdue));
  const lines: string[] = [];
  lines.push(`Hello ${nameGreet},`);
  lines.push("");
  if (days > 0) {
    lines.push(
      `A gentle reminder — ₹${inr(input.amount)} is pending for ${days} day${days === 1 ? "" : "s"} on your account.`,
    );
  } else {
    lines.push(
      `A gentle reminder — ₹${inr(input.amount)} is due on your account.`,
    );
  }
  if (input.paymentLinkUrl) {
    lines.push("");
    lines.push(`You can pay online in one tap: ${input.paymentLinkUrl}`);
  }
  lines.push("");
  lines.push("Please let me know when we can expect the payment.");
  lines.push("Thank you!");
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
      "WhatsApp not available",
      "Install WhatsApp or copy the message manually.",
    );
    return false;
  }
}
