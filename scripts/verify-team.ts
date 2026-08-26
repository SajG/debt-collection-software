/**
 * verify-team.ts
 *
 * Reads the canonical TEAM roster from prisma/team.ts and, for each row,
 * reports whether:
 *   - a Profile row exists (id + isActive + role)
 *   - a Supabase Auth user exists (id + phone_confirmed_at)
 *   - their ids agree
 *
 * The single most common silent break is Profile.id != auth.users.id: the
 * user passes the provisioning gate and receives an OTP (both look at
 * phone), Supabase authenticates them, and then AuthContext.loadProfile
 * looks the profile up by auth.uid() — finds nothing — and signs them
 * straight back out. To the user this presents as "the OTP worked and
 * then nothing happened". We flag it as ID_MISMATCH so it can't hide.
 *
 * Run:  npm run verify:team
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
 * Exits non-zero if any row has a problem.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { TEAM, toE164 } from "../prisma/team";

type Status =
  | "OK"
  | "NO_PROFILE"
  | "NO_AUTH"
  | "ID_MISMATCH"
  | "PHONE_NOT_CONFIRMED"
  | "INACTIVE"
  | "ROLE_MISMATCH";

type Row = {
  name: string;
  phone: string;
  profileId: string | null;
  profileActive: boolean | null;
  profileRole: string | null;
  authId: string | null;
  phoneConfirmed: boolean;
  status: Status;
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
    process.exit(2);
  }

  const db = new PrismaClient();
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pull the full auth users list once — perPage=1000 comfortably covers
  // this team. If the team ever grows past that, page here.
  const { data: authList, error: authErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (authErr) {
    console.error(`ERROR: auth.admin.listUsers failed: ${authErr.message}`);
    await db.$disconnect();
    process.exit(2);
  }
  const authUsers = authList?.users ?? [];

  const rows: Row[] = [];
  for (const t of TEAM) {
    const e164 = toE164(t.phone);

    const profile = await db.profile.findFirst({
      where: { OR: [{ phone: e164 }, { phone: t.phone }] },
    });

    const authUser = authUsers.find(
      (u) => u.phone === e164 || u.phone === t.phone,
    );

    let status: Status;
    if (!profile && !authUser) {
      status = "NO_PROFILE"; // both missing — never seeded
    } else if (!profile) {
      status = "NO_PROFILE";
    } else if (!authUser) {
      status = "NO_AUTH";
    } else if (profile.id !== authUser.id) {
      status = "ID_MISMATCH";
    } else if (!authUser.phone_confirmed_at) {
      status = "PHONE_NOT_CONFIRMED";
    } else if (profile.isActive === false) {
      status = "INACTIVE";
    } else if (profile.role !== t.role) {
      status = "ROLE_MISMATCH";
    } else {
      status = "OK";
    }

    rows.push({
      name: t.ownerName,
      phone: e164,
      profileId: profile?.id ?? null,
      profileActive: profile?.isActive ?? null,
      profileRole: profile?.role ?? null,
      authId: authUser?.id ?? null,
      phoneConfirmed: !!authUser?.phone_confirmed_at,
      status,
    });
  }

  printTable(rows);

  const bad = rows.filter((r) => r.status !== "OK");
  console.log("");
  if (bad.length === 0) {
    console.log(`All ${rows.length} team members verified OK.`);
  } else {
    console.log(`${bad.length} of ${rows.length} rows have problems:`);
    for (const r of bad) {
      console.log(`  - ${r.name} (${r.phone}): ${explain(r.status)}`);
    }
  }

  await db.$disconnect();
  process.exit(bad.length === 0 ? 0 : 1);
}

function short(id: string | null): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

function printTable(rows: Row[]) {
  const H = {
    name: "Name",
    phone: "Phone",
    profile: "Profile (id · active · role)",
    auth: "Auth (id · phone_confirmed_at)",
    status: "Status",
  };
  const wName = Math.max(H.name.length, ...rows.map((r) => r.name.length));
  const wPhone = Math.max(H.phone.length, ...rows.map((r) => r.phone.length));
  const profileCell = (r: Row) =>
    r.profileId
      ? `${short(r.profileId)}… · ${r.profileActive ? "active" : "INACTIVE"} · ${r.profileRole}`
      : "—";
  const authCell = (r: Row) =>
    r.authId
      ? `${short(r.authId)}… · ${r.phoneConfirmed ? "confirmed" : "UNCONFIRMED"}`
      : "—";
  const wProf = Math.max(H.profile.length, ...rows.map((r) => profileCell(r).length));
  const wAuth = Math.max(H.auth.length, ...rows.map((r) => authCell(r).length));
  const wStat = Math.max(H.status.length, ...rows.map((r) => r.status.length));

  const line = (a: string, b: string, c: string, d: string, e: string) =>
    `  ${a.padEnd(wName)}  ${b.padEnd(wPhone)}  ${c.padEnd(wProf)}  ${d.padEnd(wAuth)}  ${e.padEnd(wStat)}`;
  const rule = line(
    "-".repeat(wName),
    "-".repeat(wPhone),
    "-".repeat(wProf),
    "-".repeat(wAuth),
    "-".repeat(wStat),
  );

  console.log("");
  console.log(line(H.name, H.phone, H.profile, H.auth, H.status));
  console.log(rule);
  for (const r of rows) {
    console.log(line(r.name, r.phone, profileCell(r), authCell(r), r.status));
  }
}

function explain(s: Status): string {
  switch (s) {
    case "NO_PROFILE":
      return "no Profile row — team seed never ran for this user. Fix: npm run db:seed.";
    case "NO_AUTH":
      return "no Supabase Auth user for this phone — seed created a Profile without an auth user.";
    case "ID_MISMATCH":
      return "Profile.id != auth.users.id — OTP will succeed then AuthContext.loadProfile finds nothing and signs the user straight back out. This is the bug that presents as 'OTP worked and then nothing happened'. Fix: delete the Profile row and re-seed so the row is created with id = auth user id.";
    case "PHONE_NOT_CONFIRMED":
      return "auth user exists but phone_confirmed_at is NULL — signInWithOtp will keep asking for a code that never verifies.";
    case "INACTIVE":
      return "Profile.isActive = false — AuthContext routes to /account-disabled and signs out.";
    case "ROLE_MISMATCH":
      return "Profile.role does not match the roster — user may land in the wrong tab group.";
    case "OK":
      return "ok";
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
