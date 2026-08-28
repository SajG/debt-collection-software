import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("env missing"); process.exit(1); }

// Sajal Ghatpande — ADMIN — +917774055316. See prisma/team.ts.
const TARGET_PHONE = "917774055316";
const TARGET_EMAIL = "sajal.ghatpande@gmail.com";

// Fresh 24-char base64url password. Shown ONCE.
const pw = randomBytes(18).toString("base64url");

const s = createClient(url, key, { auth: { persistSession: false } });

// Find by phone.
const { data: list, error: listErr } = await s.auth.admin.listUsers({ perPage: 200 });
if (listErr) { console.error("listUsers:", listErr.message); process.exit(1); }
const user = (list?.users ?? []).find(u => u.phone === TARGET_PHONE);
if (!user) { console.error(`No auth user with phone ${TARGET_PHONE}`); process.exit(1); }

const { error: upErr } = await s.auth.admin.updateUserById(user.id, {
  email: TARGET_EMAIL,
  email_confirm: true,
  password: pw,
});
if (upErr) { console.error("updateUserById:", upErr.message); process.exit(1); }

// Kill every existing session so old @synworks.local sign-ins die.
await s.auth.admin.signOut(user.id, "global").catch(() => {});

console.log("\n" + "=".repeat(60));
console.log("ADMIN LOGIN — COPY NOW (shown once)");
console.log("=".repeat(60));
console.log(`Email:    ${TARGET_EMAIL}`);
console.log(`Password: ${pw}`);
console.log("=".repeat(60));
console.log("\nNext steps:");
console.log("1. Sign in at /login with the above.");
console.log("2. You'll be forced to /settings/security?first=1 — enrol TOTP.");
console.log("3. Save the 8 recovery codes shown once.");
console.log("4. Change the password from /settings — the one above is temporary.");
console.log("5. Then run: npm run rotate:compromised -- --commit");
console.log("   to close the SY0 hole for the other 14 users.\n");
