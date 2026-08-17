import { PrismaClient, OrderStatus } from "@prisma/client";
import { randomUUID } from "crypto";

const db = new PrismaClient();

const CATALOGUE: Array<{ brand: string; name: string; sortOrder: number }> = [
  // Polygum
  { brand: "Polygum", name: "Polygum Waterproofing Compound", sortOrder: 10 },
  { brand: "Polygum", name: "Polygum Sealant Paste", sortOrder: 20 },
  { brand: "Polygum", name: "Polygum Crack Filler", sortOrder: 30 },
  // Ombond
  { brand: "Ombond", name: "Ombond Wood Adhesive", sortOrder: 40 },
  { brand: "Ombond", name: "Ombond PVA White Glue", sortOrder: 50 },
  { brand: "Ombond", name: "Ombond Instant Bond", sortOrder: 60 },
  // Omcol
  { brand: "Omcol", name: "Omcol Contact Adhesive", sortOrder: 70 },
  { brand: "Omcol", name: "Omcol Rubber Cement", sortOrder: 80 },
  { brand: "Omcol", name: "Omcol Solvent Adhesive", sortOrder: 90 },
  // Stick-onn
  { brand: "Stick-onn", name: "Stick-onn Foam Tape", sortOrder: 100 },
  { brand: "Stick-onn", name: "Stick-onn Double-Sided Tape", sortOrder: 110 },
  { brand: "Stick-onn", name: "Stick-onn Insulation Tape", sortOrder: 120 },
  // Magbond
  { brand: "Magbond", name: "Magbond Tile Adhesive", sortOrder: 130 },
  { brand: "Magbond", name: "Magbond Floor Adhesive", sortOrder: 140 },
  { brand: "Magbond", name: "Magbond Marble Fix", sortOrder: 150 },
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
  const magbond = products.find((p) => p.brand === "Magbond");
  if (!polygum || !magbond) {
    throw new Error("Expected Polygum and Magbond products in catalogue");
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
      productId: magbond.id,
      brand: magbond.brand,
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
