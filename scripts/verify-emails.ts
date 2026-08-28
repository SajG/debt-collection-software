import { PrismaClient } from "@prisma/client";

// Gate for the SY-email rollout: refuse to move on until every
// Profile carries a real deliverable email address. Called between
// the CSV backfill (SY11) and the invite blast (SY-email) so the
// SQL enrollment surface can be dropped in confidence.
//
// Prints a table of every offender. Exit 0 only if every ACTIVE
// profile has a non-null address AND that address does not match
// any of the fake-domain patterns the DB CHECK constraint blocks.
//
// Inactive profiles are ignored — they're not signing in anyway,
// and forcing every test row to have an inbox is noise.
//
// Usage:
//   node --env-file=.env -r ts-node/register scripts/verify-emails.ts
// or via npm:
//   npm run verify:emails

const FAKE_DOMAIN_RE = /\.(local|test|invalid|internal|localhost|example)$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Offender = {
  ownerName: string;
  phone: string | null;
  role: string;
  email: string | null;
  reason: "missing" | "malformed" | "fake_domain";
};

async function main() {
  const db = new PrismaClient();
  const profiles = await db.profile.findMany({
    where: { isActive: true },
    select: {
      id: true,
      ownerName: true,
      phone: true,
      role: true,
      email: true,
    },
    orderBy: [{ role: "asc" }, { ownerName: "asc" }],
  });

  const offenders: Offender[] = [];
  for (const p of profiles) {
    if (!p.email) {
      offenders.push({
        ownerName: p.ownerName,
        phone: p.phone,
        role: p.role,
        email: null,
        reason: "missing",
      });
      continue;
    }
    if (!EMAIL_RE.test(p.email)) {
      offenders.push({
        ownerName: p.ownerName,
        phone: p.phone,
        role: p.role,
        email: p.email,
        reason: "malformed",
      });
      continue;
    }
    if (FAKE_DOMAIN_RE.test(p.email)) {
      offenders.push({
        ownerName: p.ownerName,
        phone: p.phone,
        role: p.role,
        email: p.email,
        reason: "fake_domain",
      });
      continue;
    }
  }

  console.log(
    `\nChecked ${profiles.length} active profile(s). ${offenders.length} offender(s).\n`,
  );
  if (offenders.length === 0) {
    console.log(
      "OK — every active profile has a real deliverable email address.",
    );
    console.log("Safe to send invites and to drop enrollment-code surface.");
    await db.$disconnect();
    process.exit(0);
  }

  console.table(
    offenders.map((o) => ({
      name: o.ownerName,
      role: o.role,
      phone: o.phone ?? "—",
      email: o.email ?? "(null)",
      reason: o.reason,
    })),
  );
  console.error(
    "\nFAIL — the profiles above need a real address before the invite blast can go out.",
  );
  console.error("Fix with: npm run backfill:team-emails -- --csv <path> --commit");
  console.error("Then re-run this verifier.\n");
  await db.$disconnect();
  process.exit(1);
}

void main();
