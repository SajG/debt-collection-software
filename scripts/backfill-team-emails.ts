import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// Backfill team email addresses from a CSV. Two columns, no header
// required: `phone,email` (10-digit phone + real address).
//
// Usage:
//   npm run backfill:team-emails -- --csv <path>
//   npm run backfill:team-emails -- --csv <path> --commit
//
// Default is dry-run — prints the change table and exits without
// touching the DB. Pass --commit to write.
//
// Runs three writes per row, in order:
//   1. Profile.email  (Prisma; caught by the fake-domain CHECK
//      constraint if a fake sneaks in — belt-and-braces)
//   2. auth.users.email (Supabase admin API; sets email_confirm=false
//      so the invite email that follows confirms it)
//   3. does NOT fire an invite — that's the admin's call from
//      /admin/users → Resend invite once emails are in.
//
// Refuses to run if any address matches the fake-domain blocklist.
// The @synworks.local pattern MUST never come back.

const FAKE_DOMAIN_RE = /\.(local|test|invalid|internal|localhost|example)$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_10 = /^[6-9]\d{9}$/;

type Row = { phone: string; email: string; lineNo: number };
type Outcome =
  | "UPDATED"
  | "NO_CHANGE"
  | "SKIPPED_NO_PROFILE"
  | "SKIPPED_DUPE_EMAIL"
  | "SKIPPED_FAKE_DOMAIN"
  | "SKIPPED_MALFORMED"
  | "FAILED";

type Result = {
  phone: string;
  ownerName: string | null;
  before: string | null;
  after: string;
  outcome: Outcome;
  detail?: string;
};

async function main() {
  const args = process.argv.slice(2);
  const csvIdx = args.indexOf("--csv");
  if (csvIdx < 0 || !args[csvIdx + 1]) {
    console.error("Usage: --csv <path> [--commit]");
    process.exit(1);
  }
  const csvPath = args[csvIdx + 1]!;
  const commit = args.includes("--commit");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL required.");
    process.exit(1);
  }

  const raw = await readFile(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length === 0) {
    console.error("No rows in CSV.");
    process.exit(1);
  }

  // Refuse to proceed if ANY row uses a fake domain — an admin
  // pasting the old @synworks.local list is exactly what we're
  // guarding against.
  const badDomains = rows.filter((r) => FAKE_DOMAIN_RE.test(r.email));
  if (badDomains.length > 0) {
    console.error("");
    console.error("Refusing to run. These CSV rows use blocked fake domains:");
    for (const r of badDomains) {
      console.error(`  line ${r.lineNo}: ${r.phone} ${r.email}`);
    }
    console.error("");
    console.error("Fake domains: .local .test .invalid .internal .localhost .example");
    console.error("Ask the person for a real deliverable address.");
    process.exit(1);
  }

  console.log(`\nBackfill emails — ${commit ? "COMMIT" : "DRY-RUN"}`);
  console.log("=".repeat(48));
  if (!commit) {
    console.log("Dry-run. Re-run with --commit to persist.");
  }
  console.log();

  const db = new PrismaClient();
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const results: Result[] = [];

  for (const row of rows) {
    const res: Result = {
      phone: row.phone,
      ownerName: null,
      before: null,
      after: row.email,
      outcome: "FAILED",
    };

    if (!PHONE_10.test(row.phone) || !EMAIL_RE.test(row.email)) {
      res.outcome = "SKIPPED_MALFORMED";
      results.push(res);
      continue;
    }
    if (FAKE_DOMAIN_RE.test(row.email)) {
      res.outcome = "SKIPPED_FAKE_DOMAIN";
      results.push(res);
      continue;
    }

    const profile = await db.profile.findFirst({
      where: { phone: row.phone },
      select: { id: true, ownerName: true, email: true },
    });
    if (!profile) {
      res.outcome = "SKIPPED_NO_PROFILE";
      results.push(res);
      continue;
    }
    res.ownerName = profile.ownerName;
    res.before = profile.email;

    if (profile.email?.toLowerCase() === row.email.toLowerCase()) {
      res.outcome = "NO_CHANGE";
      results.push(res);
      continue;
    }

    // Reject if the target email already sits on someone else's row.
    const dupe = await db.profile.findFirst({
      where: { email: row.email, NOT: { id: profile.id } },
      select: { id: true, ownerName: true },
    });
    if (dupe) {
      res.outcome = "SKIPPED_DUPE_EMAIL";
      res.detail = `already on ${dupe.ownerName}`;
      results.push(res);
      continue;
    }

    if (!commit) {
      res.outcome = "UPDATED";
      results.push(res);
      continue;
    }

    try {
      await db.profile.update({
        where: { id: profile.id },
        data: { email: row.email },
      });
      const { error: authErr } = await supabase.auth.admin.updateUserById(
        profile.id,
        { email: row.email, email_confirm: false },
      );
      if (authErr) throw new Error(`auth: ${authErr.message}`);
      res.outcome = "UPDATED";
    } catch (e) {
      res.outcome = "FAILED";
      res.detail = e instanceof Error ? e.message : String(e);
    }
    results.push(res);
  }

  // Summary table.
  for (const r of results) {
    const tag = r.outcome.padEnd(22);
    const name = (r.ownerName ?? "—").padEnd(24);
    const before = (r.before ?? "—").padEnd(30);
    console.log(
      `  ${tag} ${r.phone} ${name} ${before} → ${r.after}${r.detail ? `  (${r.detail})` : ""}`,
    );
  }
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  console.log();
  console.log(
    `Summary (${commit ? "COMMIT" : "DRY-RUN"}): ${JSON.stringify(counts)} across ${results.length} rows.`,
  );

  await db.$disconnect();
  const failed = counts["FAILED"] ?? 0;
  if (failed > 0) process.exit(1);
}

/** Trivial CSV parser — enough for phone,email pairs. Skips blank
 *  lines and any line whose first cell is a header word. */
function parseCsv(text: string): Row[] {
  const out: Row[] = [];
  let lineNo = 0;
  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    if (/^phone/i.test(line)) continue; // header
    const [phoneRaw, emailRaw] = line.split(",").map((c) => c.trim());
    if (!phoneRaw || !emailRaw) continue;
    const phone = phoneRaw.replace(/\D/g, "").slice(-10);
    const email = emailRaw.toLowerCase();
    out.push({ phone, email, lineNo });
  }
  return out;
}

void main();
