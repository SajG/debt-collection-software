import { createClient } from "@supabase/supabase-js";

// DEV-ONLY sign-in helper. Given an email, ask Supabase to generate
// the magic-link + OTP that WOULD be sent by the email template,
// and print the 6-digit code straight to the terminal. No email
// delivery required.
//
// The OTP that comes back is the real, live token — same one
// verifyOtp({ email, token, type: 'email' }) accepts. It expires
// in 10 minutes (Authentication → Providers → Email → Email OTP
// Expiration).
//
// This script uses SUPABASE_SERVICE_ROLE_KEY, which is local-only.
// Do NOT ship this to prod. Do NOT wire it into an API route.
//
// Usage:  node --env-file=.env scripts/dev-get-otp.mjs <email>

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("env missing"); process.exit(1); }

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/dev-get-otp.mjs <email>");
  process.exit(1);
}

const s = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await s.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (error) { console.error(error.message); process.exit(1); }

const otp = data?.properties?.email_otp ?? null;
const link = data?.properties?.action_link ?? null;

console.log("\n" + "=".repeat(48));
console.log(`  Email: ${email}`);
console.log(`  OTP:   ${otp ?? "(not returned)"}`);
console.log("=".repeat(48));
if (link) console.log(`\n  Magic link (web fallback): ${link}\n`);
console.log("Expires in 10 minutes. Type the OTP into the app.\n");
