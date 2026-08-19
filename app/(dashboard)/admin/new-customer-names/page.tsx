import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { PageHeader, Card } from "../../_components/ui";
import { PromoteForm } from "./promote-form";

export const dynamic = "force-dynamic";

// Every SalesOrder placed against a free-text customer name (rather
// than a real Party). Left untouched these accumulate exactly the
// spelling-inconsistency problem the app was built to remove
// ("Kumar Traders" vs "Kumar Traders." vs "Kumar Trader"), so this
// screen exists so an admin can promote each one to a real Party in
// one click, back-filling partyId on every order that shared that
// exact free-text name.
export default async function NewCustomerNamesPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const grouped = await db.salesOrder.groupBy({
    by: ["newCustomerName"],
    where: { newCustomerName: { not: null }, partyId: null },
    _count: { _all: true },
    orderBy: { _count: { newCustomerName: "desc" } },
  });

  const assignees = await db.profile.findMany({
    where: { isActive: true, role: { in: ["STAFF", "ADMIN"] } },
    select: { id: true, ownerName: true, role: true },
    orderBy: [{ role: "asc" }, { ownerName: "asc" }],
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Free-text customer names"
        subtitle="Orders placed against a customer that isn't in the Party ledger yet. Promote each name to a real Party — every order carrying that spelling is back-filled in one click."
      />

      {grouped.length === 0 ? (
        <Card title="Nothing to reconcile">
          <p className="text-sm text-muted-foreground">
            Every existing SalesOrder is linked to a real Party.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <Card
              key={g.newCustomerName ?? "unknown"}
              title={`"${g.newCustomerName}" · ${g._count._all} order${g._count._all === 1 ? "" : "s"}`}
            >
              <PromoteForm
                fromName={g.newCustomerName ?? ""}
                orderCount={g._count._all}
                assignees={assignees}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
