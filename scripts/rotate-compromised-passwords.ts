import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PHONE_10, TEAM, toE164 } from "../prisma/team";

// One-shot remediation for TWO past exposures. Covers both, in one
// pass, per user:
//
// EXPOSURE #1 — enable-test-login.ts (SY0)
//   Set every team member's Supabase Auth password to their own
//   E.164 phone number and attached synthetic `@synworks.local`
//   emails. Anyone who knew a team phone could hit
//     /auth/v1/token?grant_type=password
//   with { email: "<10digit>@synworks.local",
//          password: "+91<10digit>" } and receive a real JWT for
//   that user. Deleting the client shortcut does NOT close the hole
//   — the credentials live on Supabase's servers.
//
// EXPOSURE #2 — redeem_and_mint_session RPC (SY1-b, dropped SY-email)
//   Was anon-callable + SECURITY DEFINER. Every successful enroll
//   wrote a fresh bcrypt password into auth.users.encrypted_password
//   AND returned that password over the wire to the mobile client.
//   The mobile client used it once for signInWithPassword and threw
//   it away — but the SUPABASE row keeps the credential valid
//   indefinitely. Anyone who intercepted a plaintext could reuse it
//   the day after the user signed in. The RPC also attached a
//   synthetic `@device.paytrack.local` email that a residual
//   password-grant could still target.
//
// This script, for every phone in prisma/team.ts:
//   1. Sets a fresh cryptographically-random password. Never
//      printed, never stored. Nobody, including the admin running
//      this script, ever learns it. The new sign-in path is email
//      OTP — no password needed.
//   2. If auth.users.email matches a KNOWN synthetic domain
//      (@synworks.local, @device.paytrack.local, @invalid.local
//      from an earlier partial rotation), replace it with the
//      Profile.email that SY11 backfilled. Refuse to rotate if no
//      Profile.email exists — the verify-emails.ts gate should
//      have caught this before we got here.
//   3. Calls admin.signOut(user.id, "global") to invalidate every
//      existing refresh token — anyone currently on a session
//      minted by either exposure is signed out immediately.
//   4. Writes a UserAuditLog row (best-effort) so this is visible
//      after the fact.
//
// Default is --dry-run: prints exactly what would happen without
// touching Supabase. Pass --commit to actually execute. Safe to
// re-run; the second run is a no-op on already-rotated users.

const SYNTHETIC_DOMAIN_RE =
  /@(synworks\.local|device\.paytrack\.local|invalid\.local)$/i;

type Outcome =
  | "ROTATED"
  | "SKIPPED_NO_USER"
  | "SKIPPED_NO_PROFILE_EMAIL"
  | "SKIPPED_ALREADY_CLEAN"
  | "FAILED";

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
  const db = new PrismaClient();

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

    const currentEmail = (user.email ?? "").toLowerCase();
    const hasSynthetic = SYNTHETIC_DOMAIN_RE.test(currentEmail);

    // Pull the Profile-side real email. Both rotation paths need a
    // deliverable address to replace a synthetic with; without one
    // we'd have to invent something and we're not doing that ever
    // again (see SECURITY.md "Known past exposure").
    const profile = await db.profile.findFirst({
      where: { phone: row.phone },
      select: { email: true },
    });
    const realEmail = profile?.email?.toLowerCase() ?? null;

    if (hasSynthetic && !realEmail) {
      results.push({
        name: row.ownerName,
        role: row.role,
        e164,
        outcome: "SKIPPED_NO_PROFILE_EMAIL",
        detail:
          "auth.users still on synthetic email — Profile.email missing (run verify-emails.ts + backfill first)",
      });
      continue;
    }

    if (!commit) {
      const parts: string[] = [];
      parts.push("would rotate password");
      if (hasSynthetic && realEmail) {
        parts.push(`would replace ${currentEmail} → ${realEmail}`);
      } else if (!hasSynthetic) {
        parts.push("email already clean");
      }
      parts.push("would sign out globally");
      results.push({
        name: row.ownerName,
        role: row.role,
        e164,
        outcome: "ROTATED",
        detail: parts.join("; "),
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
      if (hasSynthetic && realEmail) {
        updatePayload.email = realEmail;
        updatePayload.email_confirm = true;
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

      // Best-effort audit trail. Do NOT roll back on failure — the
      // rotation is what matters; the log is a paper trail.
      try {
        await db.userAuditLog.create({
          data: {
            actorId: null,
            targetProfileId: user.id,
            action: "DEACTIVATED",
            detail:
              "rotate-compromised-passwords: password rotated + session revoked (SY-email cleanup)",
          },
        });
      } catch {
        /* enum drift / missing target → non-fatal */
      }

      const detailBits: string[] = [];
      detailBits.push("password rotated");
      if (hasSynthetic && realEmail) {
        detailBits.push(`email → ${realEmail}`);
      } else if (!hasSynthetic) {
        detailBits.push("email already clean");
      }
      detailBits.push("sessions revoked globally");
      results.push({
        name: row.ownerName,
        role: row.role,
        e164,
        outcome: "ROTATED",
        detail: detailBits.join("; "),
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

  for (const r of results) {
    const tag = r.outcome.padEnd(26);
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

  await db.$disconnect();

  const failed = counts["FAILED"] ?? 0;
  const noEmail = counts["SKIPPED_NO_PROFILE_EMAIL"] ?? 0;
  if (failed > 0 || noEmail > 0) process.exit(1);
}

void main();
