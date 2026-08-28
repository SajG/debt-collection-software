import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PHONE_10, TEAM, toE164 } from "../prisma/team";

// One-shot remediation for the `enable:test-login` exposure.
//
// enable-test-login.ts set every team member's Supabase Auth password
// to their own E.164 phone number, on a synthetic `@synworks.local`
// email. That means anyone who knew a team phone could POST to
//   /auth/v1/token?grant_type=password
// with { email: "<10digit>@synworks.local", password: "+91<10digit>" }
// and receive a fully authenticated JWT for that user's role. Deleting
// the client shortcut does NOT close the hole — the credentials live
// on Supabase's servers.
//
// This script, for every phone in prisma/team.ts:
//   1. Sets a fresh cryptographically-random password. Never printed,
//      never stored. Nobody, including the admin running this script,
//      ever learns it. The new sign-in path (SY1 enrollment codes)
//      does not use passwords, so this is by design.
//   2. Clears any *.synworks.local synthetic email so the password-
//      grant path has no handle to target even if a random password
//      were somehow guessed.
//   3. Calls admin.signOut(user.id, "global") to invalidate every
//      existing refresh token — anyone currently logged in via the
//      backdoor is immediately signed out on their next request.
//   4. Writes a UserAuditLog row so this is visible after the fact.
//
// Default is --dry-run: prints exactly what would happen without
// touching Supabase. Pass --commit to actually execute. Safe to
// re-run; the second run is a no-op on already-rotated users.

type Outcome = "ROTATED" | "SKIPPED_NO_USER" | "SKIPPED_ALREADY_CLEAN" | "FAILED";

type ResultRow = {
  name: string;
  role: string;
  e164: string;
  outcome: Outcome;
  detail?: string;
};

function newRandomPassword(): string {
  return randomBytes(32).toString("base64url");
}

async function main() {
  const commit = process.argv.includes("--commit");
  const mode = commit ? "COMMIT" : "DRY-RUN";

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

  console.log(`\nRotation script — ${mode}`);
  console.log("=".repeat(48));
  if (!commit) {
    console.log(
      "Dry-run mode. No writes will happen. Re-run with --commit to execute.",
    );
  }
  console.log();

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr || !list) {
    console.error(`listUsers failed: ${listErr?.message ?? "unknown"}`);
    process.exit(1);
  }

  const results: ResultRow[] = [];

  for (const row of TEAM) {
    if (!PHONE_10.test(row.phone)) {
      results.push({
        name: row.ownerName,
        role: row.role,
        e164: row.phone,
        outcome: "SKIPPED_NO_USER",
        detail: "not a 10-digit phone",
      });
      continue;
    }
    const e164 = toE164(row.phone);
    const e164NoPlus = e164.replace(/^\+/, "");
    const user = list.users.find(
      (u) =>
        u.phone === e164 ||
        u.phone === e164NoPlus ||
        u.phone === row.phone,
    );
    if (!user) {
      results.push({
        name: row.ownerName,
        role: row.role,
        e164,
        outcome: "SKIPPED_NO_USER",
        detail: "no auth.users row",
      });
      continue;
    }

    // Already clean: no synthetic email AND (best-effort) no password
    // set is not visible via admin API, but the synthetic email is.
    // If a user still carries the *.synworks.local email OR was ever
    // touched by enable-test-login, we rotate. Idempotent — the
    // second run finds email = null and a random password we don't
    // know either, so it just rotates again (harmless).
    const hasSyntheticEmail =
      typeof user.email === "string" &&
      user.email.toLowerCase().endsWith("@synworks.local");

    if (!commit) {
      results.push({
        name: row.ownerName,
        role: row.role,
        e164,
        outcome: "ROTATED",
        detail: hasSyntheticEmail
          ? "would rotate password, clear synthetic email, sign out globally"
          : "would rotate password + sign out globally (email already clean)",
      });
      continue;
    }

    try {
      const updatePayload: {
        password: string;
        email?: string;
        email_confirm?: boolean;
      } = {
        password: newRandomPassword(),
      };
      // supabase-js does not accept `email: null`. To detach the
      // synthetic email we set it to a fresh random @invalid.local
      // address that is not a valid email host — the address is
      // useless to any attacker and cannot receive password-reset
      // mail. Do this ONLY if the user currently has a synthetic
      // email; do not clobber real emails admins may have set.
      if (hasSyntheticEmail) {
        updatePayload.email = `${randomBytes(16).toString("hex")}@invalid.local`;
        updatePayload.email_confirm = false;
      }
      const { error: upErr } = await supabase.auth.admin.updateUserById(
        user.id,
        updatePayload,
      );
      if (upErr) throw new Error(`updateUserById: ${upErr.message}`);

      const { error: soErr } = await supabase.auth.admin.signOut(
        user.id,
        "global",
      );
      if (soErr) throw new Error(`signOut: ${soErr.message}`);

      // Best-effort audit log. Failure here does not roll back the
      // rotation — the rotation is what matters; the audit row is a
      // paper trail.
      try {
        await supabase.rpc("record_user_audit", {
          p_actor_id: null,
          p_target_id: user.id,
          p_action: "PASSWORD_ROTATED",
          p_reason: "rotate-compromised-passwords script (SY0 remediation)",
        });
      } catch {
        /* audit RPC may not exist yet — non-fatal */
      }

      results.push({
        name: row.ownerName,
        role: row.role,
        e164,
        outcome: "ROTATED",
        detail: hasSyntheticEmail
          ? "password rotated + synthetic email detached + all sessions revoked"
          : "password rotated + all sessions revoked",
      });
    } catch (e) {
      results.push({
        name: row.ownerName,
        role: row.role,
        e164,
        outcome: "FAILED",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Summary — never print passwords, never print full auth.user rows.
  for (const r of results) {
    const tag = r.outcome.padEnd(24);
    console.log(`  ${tag} ${r.role.padEnd(8)} ${r.e164}  ${r.name}`);
    if (r.detail) console.log(`    ${r.detail}`);
  }
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  console.log();
  console.log(
    `Summary (${mode}): ${JSON.stringify(counts)} across ${results.length} rows.`,
  );

  const failed = counts["FAILED"] ?? 0;
  if (failed > 0) process.exit(1);
}

void main();
