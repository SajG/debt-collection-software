import { db } from "@/lib/db";

// SY23 — one-click sample dataset for /onboarding step (c).
//
// Seeds a small, clearly-labelled demo: 3 parties, one invoice per
// party, one product, one open sales order. Every row is stamped
// with the target organizationId + a `[Sample]` marker so an admin
// can find + delete them later. sampleDataSeeded flips to true on
// BusinessSettings so the settings page can show a "Purge sample
// data" button.

export async function seedSampleData(
  organizationId: string,
  ownerProfileId: string,
): Promise<void> {
  const existing = await db.businessSettings.findUnique({
    where: { organizationId },
    select: { sampleDataSeeded: true },
  });
  if (existing?.sampleDataSeeded) return;

  await db.$transaction(async (tx) => {
    // Product
    const product = await tx.product.create({
      data: {
        organizationId,
        name: "[Sample] Bonding Adhesive 5L",
        brand: "SamplePro",
        isActive: true,
      },
    });

    // Parties
    const parties = await Promise.all(
      ["Alpha Traders", "Beta Distributors", "Gamma Enterprises"].map((n) =>
        tx.party.create({
          data: {
            organizationId,
            name: `[Sample] ${n}`,
            phone: "9000000000",
            city: "Pune",
            state: "Maharashtra",
            creditLimit: 100000,
            creditDays: 30,
            consentStatus: "OPTED_IN",
            totalOutstanding: 25000,
          },
        }),
      ),
    );

    // Invoices
    const today = new Date();
    for (let i = 0; i < parties.length; i++) {
      const p = parties[i];
      await tx.invoice.create({
        data: {
          organizationId,
          partyId: p.id,
          invoiceNumber: `SAMPLE-${1000 + i}`,
          invoiceDate: new Date(today.getTime() - (i + 1) * 15 * 24 * 3600 * 1000),
          dueDate: new Date(today.getTime() - (i + 1) * 5 * 24 * 3600 * 1000),
          totalAmount: 25000,
          paidAmount: 0,
          status: "UNPAID",
          notes: "[Sample] auto-generated for onboarding demo",
        },
      });
    }

    // One open sales order so the production queue isn't empty.
    await tx.salesOrder.create({
      data: {
        organizationId,
        orderNumber: "SAMPLE-ORD-001",
        partyId: parties[0].id,
        salespersonId: ownerProfileId,
        productId: product.id,
        brand: product.brand,
        quantity: 10,
        quantityUnit: "PCS",
        productRate: "1250",
        orderValue: 12500,
        currentStatus: "ORDER_PLACED",
        creditCheckPassed: true,
        notes: "[Sample] demo order",
      },
    });

    await tx.businessSettings.update({
      where: { organizationId },
      data: { sampleDataSeeded: true },
    });
  });
}

/**
 * Purge everything the sample seeder created. Detected by the
 * `[Sample]` marker on Party.name + SalesOrder.orderNumber; parties
 * cascade to invoices/orders via existing FKs.
 */
export async function purgeSampleData(organizationId: string): Promise<void> {
  await db.$transaction([
    db.party.deleteMany({
      where: { organizationId, name: { startsWith: "[Sample]" } },
    }),
    db.salesOrder.deleteMany({
      where: { organizationId, orderNumber: { startsWith: "SAMPLE-" } },
    }),
    db.product.deleteMany({
      where: { organizationId, name: { startsWith: "[Sample]" } },
    }),
    db.businessSettings.update({
      where: { organizationId },
      data: { sampleDataSeeded: false },
    }),
  ]);
}
