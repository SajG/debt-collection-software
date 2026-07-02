import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // TODO: add domain seed data (buyers, sample invoices) in the data-model phase.
  // For now this is a no-op placeholder.
  console.log("Seed complete — no data seeded yet.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
