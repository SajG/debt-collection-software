import { PrismaClient, OrderStatus, type Role } from "@prisma/client";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

const db = new PrismaClient();

// ─────────────────────────────────────────────────────────────────
// Real team seed. Idempotent — running twice never creates duplicates
// and never resets isActive. Uses Supabase Auth Admin API to create
// the phone-auth user + our Profile row together; on Profile-insert
// failure the auth user is rolled back so no orphan can log in.
//
// Storage format: Profile.phone = "+91XXXXXXXXXX" (E.164), matching
// what toE164() sends at login. A mismatch here means the user
// authenticates with Supabase but AuthContext finds no Profile and
// signs them straight back out.
// ─────────────────────────────────────────────────────────────────

const PHONE_10 = /^[6-9]\d{9}$/;

type TeamRow = {
  ownerName: string;
  role: Role;
  /** 10-digit local number or "PENDING" for rows we intentionally skip. */
  phone: string;
  note?: string;
};

const TEAM: TeamRow[] = [
  // Admins — also route into the staff group on mobile so they can
  // place orders alongside the salespeople.
  { ownerName: "Vaibhav Ghatpande", role: "ADMIN",   phone: "9371635315" },
  { ownerName: "Sajal Ghatpande",   role: "ADMIN",   phone: "7774055316" },

  // Factory / dispatch team.
  { ownerName: "Chaitanya Deshpande", role: "FACTORY", phone: "8626010898" },
  { ownerName: "Mahesh Jadhav",       role: "FACTORY", phone: "9604558658" },
  {
    ownerName: "Seema Patil",
    role: "FACTORY",
    phone: "9921336535",
    note: "accountant; needs order rates for invoicing",
  },
  { ownerName: "Sachin Haveli",       role: "FACTORY", phone: "9923139100" },

  // Salespeople.
  { ownerName: "Sanjay Thorat",   role: "STAFF", phone: "9552670106" },
  { ownerName: "Vikas Chaudhari", role: "STAFF", phone: "7020791094" },
  { ownerName: "Sunil Karle",     role: "STAFF", phone: "7709545662" },
  { ownerName: "Irshad Jamadar",  role: "STAFF", phone: "9158464446" },
  { ownerName: "Om Sharma",       role: "STAFF", phone: "9822569216" },
  { ownerName: "Monesh Pattar",   role: "STAFF", phone: "9901112508" },
  { ownerName: "Sunil Gaikwad",   role: "STAFF", phone: "9975370106" },
  { ownerName: "Nitin Kosandar",  role: "STAFF", phone: "7028166235" },
];

const BUSINESS_NAME = "Synergy Bonding Solutions Pvt Ltd";

type SeedOutcome = "created" | "skipped-exists" | "skipped-invalid" | "failed";

function toE164(local: string): string {
  return `+91${local}`;
}

function makeSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL must be set to seed users.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findExistingProfileForPhone(local: string) {
  // Match either the new E.164 format or the legacy 10-digit format so
  // running the seed on top of a partly-migrated DB stays idempotent.
  const e164 = toE164(local);
  return db.profile.findFirst({
    where: { OR: [{ phone: e164 }, { phone: local }] },
  });
}

async function seedTeam(): Promise<
  { row: TeamRow; outcome: SeedOutcome; detail?: string; profileId?: string }[]
> {
  const results: {
    row: TeamRow;
    outcome: SeedOutcome;
    detail?: string;
    profileId?: string;
  }[] = [];

  const supabase = makeSupabaseAdmin();

  for (const row of TEAM) {
    if (!PHONE_10.test(row.phone)) {
      console.warn(
        `[seed] WARNING: skipping ${row.ownerName} (${row.role}) — phone "${row.phone}" is not a valid 10-digit Indian mobile.`,
      );
      results.push({ row, outcome: "skipped-invalid" });
      continue;
    }

    const existing = await findExistingProfileForPhone(row.phone);
    if (existing) {
      // Idempotent: never touch isActive, deactivatedAt, deactivatedById,
      // createdById. Only backfill fields that could genuinely be empty
      // from an older run — ownerName, role, businessName, and phone
      // format (10-digit → +91XXXXXXXXXX).
      const patch: Record<string, unknown> = {};
      if (existing.phone !== toE164(row.phone)) patch.phone = toE164(row.phone);
      if (existing.ownerName !== row.ownerName) patch.ownerName = row.ownerName;
      if (existing.role !== row.role) patch.role = row.role;
      if (!existing.businessName) patch.businessName = BUSINESS_NAME;
      if (Object.keys(patch).length > 0) {
        await db.profile.update({ where: { id: existing.id }, data: patch });
      }
      results.push({
        row,
        outcome: "skipped-exists",
        detail: `profile ${existing.id.slice(0, 8)}…`,
        profileId: existing.id,
      });
      continue;
    }

    const e164 = toE164(row.phone);

    // Check Supabase Auth for an orphaned user with the same phone (a
    // previous half-succeeded run) so we don't get "phone already
    // registered" and never touch the DB.
    const { data: existingList } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    const existingAuth = (existingList?.users ?? []).find(
      (u) => u.phone === e164 || u.phone === row.phone,
    );

    let userId: string;
    if (existingAuth) {
      userId = existingAuth.id;
    } else {
      const { data: created, error: createErr } =
        await supabase.auth.admin.createUser({
          phone: e164,
          phone_confirm: true,
        });
      if (createErr || !created?.user) {
        console.error(
          `[seed] FAILED auth.createUser for ${row.ownerName}: ${createErr?.message}`,
        );
        results.push({
          row,
          outcome: "failed",
          detail: createErr?.message ?? "unknown auth error",
        });
        continue;
      }
      userId = created.user.id;
    }

    try {
      await db.profile.create({
        data: {
          id: userId,
          businessName: BUSINESS_NAME,
          ownerName: row.ownerName,
          phone: e164,
          role: row.role,
          // No costCentreName — Tally reconciliation is deferred.
        },
      });
      results.push({
        row,
        outcome: "created",
        detail: `profile ${userId.slice(0, 8)}…`,
        profileId: userId,
      });
    } catch (e) {
      // Only roll back the auth user we just created (not a pre-
      // existing orphan we adopted — that could belong to something else).
      if (!existingAuth) {
        await supabase.auth.admin
          .deleteUser(userId)
          .catch(() => undefined);
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[seed] FAILED profile.create for ${row.ownerName}: ${msg}`,
      );
      results.push({ row, outcome: "failed", detail: msg });
    }
  }

  return results;
}

function printTeamSummary(
  results: Awaited<ReturnType<typeof seedTeam>>,
): void {
  const nameW = Math.max(...results.map((r) => r.row.ownerName.length), 4);
  const roleW = 7;
  const phoneW = 12;
  const outW = 18;
  const line = (
    name: string,
    role: string,
    phone: string,
    outcome: string,
  ) =>
    `  ${name.padEnd(nameW)}  ${role.padEnd(roleW)}  ${phone.padEnd(phoneW)}  ${outcome.padEnd(outW)}`;
  console.log("\nSeed summary:");
  console.log(line("Name", "Role", "Phone", "Outcome"));
  console.log(
    "  " +
      "-".repeat(nameW) +
      "  " +
      "-".repeat(roleW) +
      "  " +
      "-".repeat(phoneW) +
      "  " +
      "-".repeat(outW),
  );
  for (const r of results) {
    const phone = PHONE_10.test(r.row.phone) ? toE164(r.row.phone) : r.row.phone;
    console.log(line(r.row.ownerName, r.row.role, phone, r.outcome));
  }
}

// Product catalogue mirrors the Google Form's "Name of the product?"
// dropdown (24 options). `brand` on Product is a hint for the branded
// items; generic materials (PA-*, WR-*, PF-*, SB-*, Dexo-*, PSA-*, LM,
// Omfix, Omcol) are left with brand="" because the salesperson picks
// the actual brand at order time (they can be shipped under any brand's
// packaging).
const CATALOGUE: Array<{ brand: string; name: string; sortOrder: number }> = [
  { brand: "Polygum", name: "Polygum Wood to PVC", sortOrder: 10 },
  { brand: "Polygum", name: "Polygum D3+", sortOrder: 20 },
  { brand: "Polygum", name: "Polygum Waterproof", sortOrder: 30 },
  { brand: "Polygum", name: "Polygum Extrabonding", sortOrder: 40 },
  { brand: "Polygum", name: "Polygum Multipurpose", sortOrder: 50 },
  { brand: "Polygum", name: "Polygum Heatex", sortOrder: 60 },
  { brand: "Ombond", name: "Ombond Wood to PVC", sortOrder: 70 },
  { brand: "Ombond", name: "Ombond Waterproof", sortOrder: 80 },
  { brand: "Ombond", name: "Ombond Extrabonding", sortOrder: 90 },
  { brand: "", name: "Omfix", sortOrder: 100 },
  { brand: "", name: "Omcol", sortOrder: 110 },
  { brand: "", name: "PA-10", sortOrder: 120 },
  { brand: "", name: "PA-35", sortOrder: 130 },
  { brand: "", name: "PA-44", sortOrder: 140 },
  { brand: "", name: "PA-60(S)", sortOrder: 150 },
  { brand: "", name: "WR-45", sortOrder: 160 },
  { brand: "", name: "PF-48", sortOrder: 170 },
  { brand: "", name: "SB-25", sortOrder: 180 },
  { brand: "", name: "Dexo-555", sortOrder: 190 },
  { brand: "", name: "PSA 45", sortOrder: 200 },
  { brand: "", name: "PSA 55", sortOrder: 210 },
  { brand: "", name: "PSA 55 (With Drum)", sortOrder: 220 },
  { brand: "", name: "PSA 60", sortOrder: 230 },
  { brand: "", name: "LM ECO", sortOrder: 240 },
];

async function seedProducts() {
  for (const item of CATALOGUE) {
    const existing = await db.product.findFirst({
      where: { brand: item.brand, name: item.name },
    });
    if (existing) continue;
    await db.product.create({ data: item });
  }
  return db.product.findMany({ orderBy: { sortOrder: "asc" } });
}

async function ensureSalesperson() {
  // After seedTeam() runs, the first ADMIN or STAFF Profile is our
  // sample-orders owner. Fall back to a synthetic Prisma-only Profile
  // for local dev where seedTeam() isn't run (no service-role key).
  const existing = await db.profile.findFirst({
    where: { role: { in: ["STAFF", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return db.profile.create({
    data: {
      id: randomUUID(),
      businessName: "PayTrack Demo",
      ownerName: "Demo Salesperson",
      phone: "9999999999",
      role: "STAFF",
    },
  });
}

async function ensureParty(salespersonId: string) {
  const existing = await db.party.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    if (!existing.costCentre) {
      return db.party.update({
        where: { id: existing.id },
        data: { costCentre: "North-Sales-01" },
      });
    }
    return existing;
  }

  return db.party.create({
    data: {
      name: "Demo Traders Pvt Ltd",
      contactPerson: "Ramesh Kumar",
      phone: "9876543210",
      city: "Pune",
      state: "Maharashtra",
      costCentre: "North-Sales-01",
      creditLimit: 500000,
      creditDays: 30,
      assignedToId: salespersonId,
    },
  });
}

function currentFyLabel(now = new Date()) {
  // Indian FY Apr–Mar → "25-26"
  const year = now.getFullYear() % 100;
  const month = now.getMonth(); // 0-indexed
  const start = month >= 3 ? year : year - 1;
  const end = start + 1;
  return `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

async function seedSampleOrders(
  products: Awaited<ReturnType<typeof seedProducts>>,
  salespersonId: string,
  partyId: string,
) {
  const existingCount = await db.salesOrder.count();
  if (existingCount > 0) {
    console.log(`Skipping sample orders — ${existingCount} already present.`);
    return;
  }

  const polygum = products.find((p) => p.brand === "Polygum");
  const generic = products.find((p) => p.name === "PA-10");
  if (!polygum || !generic) {
    throw new Error("Expected Polygum and PA-10 products in catalogue");
  }

  const fy = currentFyLabel();
  const order1 = await db.salesOrder.create({
    data: {
      orderNumber: `SB/${fy}/0001`,
      partyId,
      salespersonId,
      productId: polygum.id,
      brand: polygum.brand,
      quantity: 50,
      quantityUnit: "PCS",
      packingType: "Carton",
      sizeKg: "5",
      productRate: "185",
      orderValue: 9250,
      paymentTerm: "30 days",
      transportType: "By Road",
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notes: "Seed sample — existing ledger customer",
      currentStatus: OrderStatus.ORDER_PLACED,
      creditCheckPassed: true,
      statusEvents: {
        create: {
          status: OrderStatus.ORDER_PLACED,
          notes: "Order placed (seed)",
          updatedById: salespersonId,
        },
      },
    },
  });

  const order2 = await db.salesOrder.create({
    data: {
      orderNumber: `SB/${fy}/0002`,
      newCustomerName: "New City Hardware (not in Tally yet)",
      salespersonId,
      productId: generic.id,
      brand: "Ombond",
      quantity: 200,
      quantityUnit: "KG",
      packingType: "Bag",
      sizeKg: "25",
      productRate: "42.50",
      orderValue: 8500,
      paymentTerm: "Advance",
      transportType: "Self pickup",
      notes: "Seed sample — free-text new customer",
      currentStatus: OrderStatus.IN_PRODUCTION,
      creditCheckPassed: true,
      statusEvents: {
        create: [
          {
            status: OrderStatus.ORDER_PLACED,
            notes: "Order placed (seed)",
            updatedById: salespersonId,
          },
          {
            status: OrderStatus.IN_PRODUCTION,
            notes: "Moved to production (seed)",
            updatedById: salespersonId,
          },
        ],
      },
    },
  });

  console.log(`Seeded sample orders: ${order1.orderNumber}, ${order2.orderNumber}`);
}

async function main() {
  const products = await seedProducts();
  console.log(`Product catalogue: ${products.length} items`);

  // Real team seed. Skipped when service-role creds aren't provided so
  // a local dev clone without Supabase access can still seed products.
  const canSeedTeam =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (canSeedTeam) {
    const teamResults = await seedTeam();
    printTeamSummary(teamResults);
  } else {
    console.log(
      "\nSkipping team seed — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable.",
    );
  }

  const salesperson = await ensureSalesperson();
  const party = await ensureParty(salesperson.id);
  await seedSampleOrders(products, salesperson.id, party.id);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
