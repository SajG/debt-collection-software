import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/authz";
import {
  avgOrderToDispatchHours,
  currentHoldOrders,
  defaultRange,
  ordersByBrand,
  ordersByMonth,
  ordersByProduct,
  ordersBySalesperson,
  topCustomers,
} from "@/lib/analytics";
import { PageHeader, Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const numFmt = new Intl.NumberFormat("en-IN");

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const days = Math.max(7, Math.min(365, Number(searchParams.days ?? 90)));
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const range = { from, to };
  void defaultRange; // keep import used

  const [bySalesperson, byProduct, byBrand, byMonth, top, avg, holds] =
    await Promise.all([
      ordersBySalesperson(range),
      ordersByProduct(range),
      ordersByBrand(range),
      ordersByMonth(range),
      topCustomers(range, 10),
      avgOrderToDispatchHours(range),
      currentHoldOrders(),
    ]);

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Analytics"
        subtitle={`Trailing ${days} days. Orders and value grouped by salesperson, product, brand, and month. Excludes cancelled orders.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Window:</span>
        {[30, 90, 180, 365].map((d) => (
          <a
            key={d}
            href={`/admin/analytics?days=${d}`}
            className={
              d === days
                ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                : "rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
            }
          >
            {d} days
          </a>
        ))}
        <span className="mx-2 text-muted-foreground">·</span>
        <Link
          href={`/api/admin/analytics/export?days=${days}`}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-primary hover:bg-muted"
        >
          Export CSV
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Avg order → dispatch"
          value={
            avg.avgHours == null
              ? "—"
              : avg.avgHours < 48
                ? `${avg.avgHours.toFixed(1)} h`
                : `${(avg.avgHours / 24).toFixed(1)} d`
          }
          hint={`${avg.count} dispatched orders in window`}
        />
        <StatTile
          label="Currently on hold"
          value={numFmt.format(holds.length)}
          hint="See table below for reasons"
          tone={holds.length > 0 ? "warn" : undefined}
        />
        <StatTile
          label="Salespeople active"
          value={numFmt.format(bySalesperson.length)}
          hint="Placed at least one order in window"
        />
      </div>

      <Card title="By salesperson" className="mb-6">
        <SimpleTable
          headers={["Salesperson", "Role", "Orders", "Value"]}
          rows={bySalesperson.map((r) => [
            r.name,
            r.role,
            numFmt.format(r.orderCount),
            inrFmt.format(r.totalValue),
          ])}
        />
      </Card>

      <Card title="By product" className="mb-6">
        <SimpleTable
          headers={["Product", "Brand", "Orders", "Qty", "Value"]}
          rows={byProduct.map((r) => [
            r.name,
            r.brand,
            numFmt.format(r.orderCount),
            numFmt.format(r.totalQuantity),
            inrFmt.format(r.totalValue),
          ])}
        />
      </Card>

      <Card title="By brand" className="mb-6">
        <SimpleTable
          headers={["Brand", "Orders", "Value"]}
          rows={byBrand.map((r) => [
            r.brand,
            numFmt.format(r.orderCount),
            inrFmt.format(r.totalValue),
          ])}
        />
      </Card>

      <Card title="By month" className="mb-6">
        <SimpleTable
          headers={["Month", "Orders", "Value"]}
          rows={byMonth.map((r) => [
            r.month,
            numFmt.format(r.orderCount),
            inrFmt.format(r.totalValue),
          ])}
        />
      </Card>

      <Card title="Top customers" className="mb-6">
        <SimpleTable
          headers={["Customer", "Orders", "Qty", "Value"]}
          rows={top.map((r) => [
            r.name,
            numFmt.format(r.orderCount),
            numFmt.format(r.totalQuantity),
            inrFmt.format(r.totalValue),
          ])}
        />
      </Card>

      <Card title="Orders on hold">
        {holds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No orders currently on hold.
          </p>
        ) : (
          <SimpleTable
            headers={[
              "Order",
              "Customer",
              "Salesperson",
              "Reason",
              "Held since",
            ]}
            rows={holds.map((h) => [
              h.orderNumber,
              h.customer,
              h.salesperson,
              `${h.reasonCategory.replace(/_/g, " ")} — ${h.reason}`,
              new Intl.DateTimeFormat("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }).format(h.heldSince),
            ])}
          />
        )}
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  const bg =
    tone === "warn"
      ? "bg-amber-50 border-amber-300"
      : "bg-white border-border/60";
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            {headers.map((h, i) => (
              <th
                key={h}
                className={
                  i >= 2
                    ? "py-2 pr-3 text-right"
                    : "py-2 pr-3"
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={headers.length}
                className="py-3 text-center text-muted-foreground"
              >
                No data in this window.
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={
                    j >= 2
                      ? "py-2 pr-3 text-right font-mono tabular-nums"
                      : "py-2 pr-3"
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
