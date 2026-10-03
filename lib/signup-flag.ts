// SY31 — self-serve signup feature flag. Default OFF: companies are
// onboarded one by one by the Syncit team. Server-only (read per
// request) so flipping the env var needs no client rebuild.

export function isSignupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED === "true";
}

/** Same placeholder number as the marketing pages (needs owner
 *  sign-off before launch). */
export const ONBOARDING_WHATSAPP_URL =
  "https://wa.me/919999999999?text=" +
  encodeURIComponent("Hi Syncit team, I'd like to set up my company on Syncit.");

export const ONBOARDING_ONE_BY_ONE_MESSAGE =
  "We're onboarding companies one by one — message us on WhatsApp";
