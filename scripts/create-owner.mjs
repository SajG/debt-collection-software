import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

// Provision the first ADMIN on a fresh Supabase project.
//
// Emailed-code sign-in (SY-email) is the only login channel, so this
// script creates the auth user BY EMAIL, confirms the address, and
// ensures a matching ACTIVE ADMIN Profile row. No passwords are set.
//
// Usage:
//   node scripts/create-owner.mjs --email you@example.com --name "Your Name" --phone 9876543210
//
// Env required:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   DATABASE_URL

const FAKE_DOMAIN_RE = /\.(local|test|invalid|internal|localhost|example)$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_10 = /^[6-9]\d{9}$/;
const BUSINESS_NAME_DEFAULT = "Syncit";

function parseArgs(argv) {
  const out = { email: "", name: "", phone: "", business: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--email" && next) { out.email = next; i++; }
    else if (a === "--name" && next) { out.name = next; i++; }
    else if (a === "--phone" && next) { out.phone = next; i++; }
    else if (a === "--business" && next) { out.business = next; i++; }
  }
  return out;
}

function die(msg) {
  console.error(`create-owner: ${msg}`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv);
  const email = args.email.trim().toLowerCase();
  const name = args.name.trim();
  const phone = args.phone.trim();
  const business = args.business.trim() || BUSINESS_NAME_DEFAULT;

  if (!email) die("--email is required.");
  if (!EMAIL_RE.test(email)) die(`--email "${email}" is not a valid address.`);
  if (FAKE_DOMAIN_RE.test(email))
    die(`--email uses a placeholder TLD (.local/.test/.invalid/…). Use a real deliverable address.`);
  if (!name) die("--name is required.");
  if (!phone) die("--phone is required (10-digit Indian mobile).");
  if (!PHONE_10.test(phone))
    die(`--phone "${phone}" must be a 10-digit Indian mobile starting 6-9.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = new PrismaClient();

  // 1. Locate or create the auth user by email.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) die(`auth.listUsers: ${listErr.message}`);
  const existing = (list?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email,
  );

  let userId;
  if (existing) {
    userId = existing.id;
    const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      phone: `+91${phone}`,
      phone_confirm: true,
    });
    if (updErr) die(`auth.updateUserById: ${updErr.message}`);
    console.log(`auth user ${userId.slice(0, 8)}… already existed — email confirmed.`);
  } else {
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        phone: `+91${phone}`,
        phone_confirm: true,
      });
    if (createErr || !created?.user) die(`auth.createUser: ${createErr?.message}`);
    userId = created.user.id;
    console.log(`auth user ${userId.slice(0, 8)}… created + email confirmed.`);
  }

  // 2. Ensure Profile row: ACTIVE ADMIN with this email + phone + name.
  const profile = await db.profile.findUnique({ where: { id: userId } });
  if (profile) {
    await db.profile.update({
      where: { id: userId },
      data: {
        email,
        ownerName: name,
        phone,
        businessName: profile.businessName || business,
        role: "ADMIN",
        isActive: true,
        deactivatedAt: null,
        deactivatedById: null,
      },
    });
    console.log(`profile ${userId.slice(0, 8)}… updated (role=ADMIN, active).`);
  } else {
    await db.profile.create({
      data: {
        id: userId,
        email,
        ownerName: name,
        phone,
        businessName: business,
        role: "ADMIN",
        isActive: true,
      },
    });
    console.log(`profile ${userId.slice(0, 8)}… created (role=ADMIN, active).`);
  }

  await db.$disconnect();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://getsyncit.app").replace(/\/+$/, "");

  console.log("\n" + "=".repeat(60));
  console.log("Owner ready.");
  console.log("=".repeat(60));
  console.log(`Email: ${email}`);
  console.log(`Role:  ADMIN (active)`);
  console.log("");
  console.log(`Now sign in at ${appUrl}/login with this email — a code will be emailed to you.`);
  console.log("On first ADMIN sign-in you'll be sent to /settings/security to enrol TOTP.");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
