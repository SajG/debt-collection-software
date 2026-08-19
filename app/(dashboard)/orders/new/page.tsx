import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { OrderForm, type OrderFormParty, type OrderFormProduct, type OrderFormStock } from "./order-form";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const profile = await requireProfile();
  if (profile.role === "FACTORY") {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">
          Factory users cannot place orders.
        </p>
      </div>
    );
  }

  // Mirror RLS exactly — see lib/authz.ts::partyScopeWhere.
  // Inlined originally to also filter isActive; now composed instead of
  // re-typed so it can't drift from the shared helper.
  const partyWhere = {
    ...partyScopeWhere(profile),
    isActive: true,
  };

  const [parties, products, stock] = await Promise.all([
    db.party.findMany({
      where: partyWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        totalOutstanding: true,
        creditLimit: true,
        creditDays: true,
        phone: true,
        city: true,
        assignedToId: true,
      },
      take: 2000,
    }),
    db.product.findMany({
      where: { isActive: true },
      orderBy: [{ brand: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, brand: true },
    }),
    db.stockItem.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        closingQty: true,
        lastSyncedAt: true,
      },
      take: 2000,
    }),
  ]);

  const formParties: OrderFormParty[] = parties.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    city: p.city,
    outstanding: p.totalOutstanding.toString(),
    creditLimit: p.creditLimit ? p.creditLimit.toString() : null,
    creditDays: p.creditDays,
  }));

  const formProducts: OrderFormProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
  }));

  const formStock: OrderFormStock[] = stock.map((s) => ({
    name: s.name,
    category: s.category,
    unit: s.unit,
    closingQty: s.closingQty.toString(),
    lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
  }));

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="New order"
        subtitle="Placed with the factory — status updates come back live."
      />
      <OrderForm
        role={profile.role}
        parties={formParties}
        products={formProducts}
        stock={formStock}
      />
    </div>
  );
}
