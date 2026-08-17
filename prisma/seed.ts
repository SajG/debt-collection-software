import { PrismaClient, OrderStatus } from "@prisma/client";
import { randomUUID } from "crypto";

const db = new PrismaClient();

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
  const existing = await db.profile.findFirst({
    where: { role: { in: ["STAFF", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  // Demo salesperson for local seeds — Profile.id mirrors auth.users.id in
  // production; here we mint a UUID so sample orders have a valid FK.
  return db.profile.create({
    data: {
      id: randomUUID(),
      businessName: "PayTrack Demo",
      ownerName: "Demo Salesperson",
      phone: "9999999999",
      role: "STAFF",
      costCentreName: "North-Sales-01",
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
