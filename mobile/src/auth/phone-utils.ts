// Indian mobile numbers only for now. Supabase expects E.164 format;
// users type the 10-digit local number and we prepend +91 before send.

const INDIA_CC = "+91";

export function normalisePhoneInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, 10);
}

export function isValidIndianMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

export function toE164(digits: string): string {
  return `${INDIA_CC}${digits}`;
}

/** For display: "98765 43210" — easier to read back a code over a call. */
export function formatForDisplay(digits: string): string {
  const d = normalisePhoneInput(digits);
  if (d.length !== 10) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}
