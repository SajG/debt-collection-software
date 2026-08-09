import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { PageHeader } from "../../_components/ui";
import { OrderForm } from "../order-form";

export default async function NewOrderPage() {
  const profile = await requireProfile();
  if (profile.role === "FACTORY") redirect("/production");

  const [parties, products, salespeople] = await Promise.all([
    db.party.findMany({
      where: { isActive: true, ...partyScopeWhere(profile) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, brand: true },
      orderBy: [{ brand: "asc" }, { sortOrder: "asc" }],
    }),
    profile.role === "ADMIN"
      ? db.profile.findMany({
          where: { role: { in: ["ADMIN", "STAFF"] } },
          select: { id: true, ownerName: true },
          orderBy: { ownerName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="New sales order"
        subtitle="Book a manufacturing order. A running number is issued on save."
      />
      <OrderForm
        parties={parties}
        products={products}
        salespeople={salespeople}
        showSalespersonPicker={profile.role === "ADMIN"}
      />
    </div>
  );
}
