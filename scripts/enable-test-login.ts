import { createClient } from "@supabase/supabase-js";
import { PHONE_10, TEAM, toE164 } from "../prisma/team";

// One-shot: for every provisioned team phone, attach a synthetic email
// (`<10-digit>@synworks.local`) and set the user's Supabase Auth
// password equal to their own E.164 phone. Combined with the mobile
// "test-login" fallback (see mobile/src/auth/test-login.ts), this
// lets any team member log in by entering '123456' as the OTP —
// mobile calls signInWithPassword({ email, password }) instead of
// verifyOtp, skipping SMS entirely.
//
// Why email+password instead of phone+password: the Supabase project
// has "Phone logins" (password grant) disabled, so we can't do
// signInWithPassword({ phone }). Email+password is on by default.
// The synthetic email is not deliverable; nothing ever sends to it.
//
// Trade-off (accepted for the internal-bootstrap phase): anyone who
// knows a team member's phone number can log in as them. Revisit
// before shipping the app to non-team users.
//
// Idempotent — safe to re-run.

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL must be set.",
    );
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: list, error: listErr } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr || !list) {
    console.error(`listUsers failed: ${listErr?.message}`);
    process.exit(1);
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of TEAM) {
    if (!PHONE_10.test(row.phone)) {
      skipped++;
      continue;
    }
    const e164 = toE164(row.phone);
    // auth.users.phone is stored WITHOUT the leading '+' (e.g.
    // '919371635315'). Match both formats so we tolerate whichever
    // shape supabase-js hands us.
    const e164NoPlus = e164.replace(/^\+/, "");
    const user = list.users.find(
      (u) =>
        u.phone === e164 ||
        u.phone === e164NoPlus ||
        u.phone === row.phone,
    );
    if (!user) {
      console.warn(`skip ${row.ownerName}: no auth user for ${e164}`);
      skipped++;
      continue;
    }
    const syntheticEmail = `${row.phone}@synworks.local`;
    const { error: upErr } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        email: syntheticEmail,
        email_confirm: true,
        password: e164,
      },
    );
    if (upErr) {
      console.error(`${row.ownerName}: ${upErr.message}`);
      failed++;
      continue;
    }
    console.log(`${row.ownerName} (${row.role}) ${e164} — password set`);
    ok++;
  }

  console.log(
    `\nDone. ${ok} password(s) set, ${skipped} skipped, ${failed} failed.`,
  );
  if (failed > 0) process.exit(1);
}

void main();
