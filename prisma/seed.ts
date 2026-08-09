import { PrismaClient, QuantityUnit, PaymentTerm, TransportType } from "@prisma/client";

const db = new PrismaClient();

// Real product catalogue. Brand mapping is a best guess from naming
// conventions — adjust in the DB (or re-run seed) if any product belongs
// to a different brand than assumed here.
const PRODUCTS: Array<{ name: string; brand: string | null }> = [
  // Polygum
  { name: "Polygum Wood to PVC", brand: "Polygum" },
  { name: "Polygum D3+", brand: "Polygum" },
  { name: "Polygum Waterproof", brand: "Polygum" },
  { name: "Polygum Extrabonding", brand: "Polygum" },
  { name: "Polygum Multipurpose", brand: "Polygum" },
  { name: "Polygum Heatex", brand: "Polygum" },

  // Ombond
  { name: "Ombond Wood to PVC", brand: "Ombond" },
  { name: "Ombond Waterproof", brand: "Ombond" },
  { name: "Ombond Extrabonding", brand: "Ombond" },

  // Omcol
  { name: "Omfix", brand: "Omcol" },
  { name: "Omcol", brand: "Omcol" },

  // Stick-onn grade codes
  { name: "PA-10", brand: "Stick-onn" },
  { name: "PA-60(S)", brand: "Stick-onn" },
  { name: "PA-35", brand: "Stick-onn" },
  { name: "PA-44", brand: "Stick-onn" },
  { name: "WR-45", brand: "Stick-onn" },
  { name: "PF-48", brand: "Stick-onn" },
  { name: "SB-25", brand: "Stick-onn" },
  { name: "Dexo-555", brand: "Stick-onn" },
  { name: "PSA 45", brand: "Stick-onn" },
  { name: "PSA 55", brand: "Stick-onn" },
  { name: "PSA 60", brand: "Stick-onn" },
  { name: "AP 1000", brand: "Stick-onn" },
  { name: "PP 52 HV", brand: "Stick-onn" },

  // Magbond
  { name: "LM ECO", brand: "Magbond" },
  { name: "LM ALL ROUNDER", brand: "Magbond" },
  { name: "LM SPECIAL", brand: "Magbond" },
  { name: "LMN 30", brand: "Magbond" },

  // Hotmelt SYN variants
  { name: "Hotmelt SYN 7700", brand: "Magbond" },
  { name: "Hotmelt SYN 14", brand: "Magbond" },
];

async function seedProducts() {
  let sort = 0;
  for (const p of PRODUCTS) {
    sort += 10;
    await db.product.upsert({
      where: { name: p.name },
      update: { brand: p.brand, sortOrder: sort },
      create: { name: p.name, brand: p.brand, sortOrder: sort },
    });
  }
  console.log(`Seeded ${PRODUCTS.length} products.`);
}

async function seedSampleOrders() {
  const [party, salesperson] = await Promise.all([
    db.party.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    db.profile.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);

  if (!party || !salesperson) {
    console.log(
      "Skipping sample sales orders — no Party/Profile in DB yet " +
        "(create at least one of each, then re-run `npm run db:seed`).",
    );
    return;
  }

  const polygumD3 = await db.product.findUnique({ where: { name: "Polygum D3+" } });
  const psa55 = await db.product.findUnique({ where: { name: "PSA 55" } });
  const syn7700 = await db.product.findUnique({ where: { name: "Hotmelt SYN 7700" } });
  if (!polygumD3 || !psa55 || !syn7700) return;

  const samples: Array<{
    orderNumber: string;
    productId: string;
    brand: string;
    quantity: string;
    quantityUnit: QuantityUnit;
    packingType: string;
    sizeKg: string;
    productRate: string;
    paymentTerm: PaymentTerm;
    transportType: TransportType;
    notes: string;
  }> = [
    {
      orderNumber: "SB/26-27/0001",
      productId: polygumD3.id,
      brand: "Polygum",
      quantity: "500",
      quantityUnit: "KG",
      packingType: "drum",
      sizeKg: "20",
      productRate: "125++",
      paymentTerm: "PDC",
      transportType: "PAID",
      notes: "Sample seed order — Polygum D3+ trial dispatch.",
    },
    {
      orderNumber: "SB/26-27/0002",
      productId: psa55.id,
      brand: "Stick-onn",
      quantity: "50",
      quantityUnit: "PCS",
      packingType: "carton",
      sizeKg: "5",
      productRate: "Last rate + 15/-",
      paymentTerm: "ADVANCE",
      transportType: "TO_PAY",
      notes: "Sample seed order — PSA 55 repeat customer.",
    },
    {
      orderNumber: "SB/26-27/0003",
      productId: syn7700.id,
      brand: "Magbond",
      quantity: "200",
      quantityUnit: "KG",
      packingType: "bag",
      sizeKg: "25",
      productRate: "market",
      paymentTerm: "AGAINST_DISPATCH",
      transportType: "DOOR",
      notes: "Sample seed order — Hotmelt trial.",
    },
  ];

  for (const s of samples) {
    const existing = await db.salesOrder.findUnique({ where: { orderNumber: s.orderNumber } });
    if (existing) continue;
    await db.salesOrder.create({
      data: {
        orderNumber: s.orderNumber,
        partyId: party.id,
        salespersonId: salesperson.id,
        productId: s.productId,
        brand: s.brand,
        quantity: s.quantity,
        quantityUnit: s.quantityUnit,
        packingType: s.packingType,
        sizeKg: s.sizeKg,
        productRate: s.productRate,
        paymentTerm: s.paymentTerm,
        transportType: s.transportType,
        notes: s.notes,
        currentStatus: "ORDER_PLACED",
        statusEvents: {
          create: {
            status: "ORDER_PLACED",
            notes: "Order booked (seed).",
            updatedById: salesperson.id,
          },
        },
      },
    });
  }
  console.log(`Seeded ${samples.length} sample sales orders (party=${party.name}).`);
}

async function main() {
  await seedProducts();
  await seedSampleOrders();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
