import { NextResponse, type NextRequest } from "next/server";
import { requireProfileApi } from "@/lib/authz";
import {
  avgOrderToDispatchHours,
  currentHoldOrders,
  ordersByBrand,
  ordersByMonth,
  ordersByProduct,
  ordersBySalesperson,
  topCustomers,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

// F2 — CSV export. Every analytics section rendered on-screen is
// re-serialised here as one multi-section CSV file. Excel and Google
// Sheets both open it directly. Kept as text/csv rather than pulling
// in an xlsx library — the numbers are what matter.
export async function GET(request: NextRequest) {
  const { failure } = await requireProfileApi({ adminOnly: true });
  if (failure) return failure;

  const days = Math.max(
    7,
    Math.min(365, Number(request.nextUrl.searchParams.get("days") ?? 90)),
  );
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const range = { from, to };

  const [bySalesperson, byProduct, byBrand, byMonth, top, avg, holds] =
    await Promise.all([
      ordersBySalesperson(range),
      ordersByProduct(range),
      ordersByBrand(range),
      ordersByMonth(range),
      topCustomers(range, 50),
      avgOrderToDispatchHours(range),
      currentHoldOrders(),
    ]);

  const q = (s: string): string =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const row = (cells: (string | number)[]): string =>
    cells.map((c) => q(String(c))).join(",");

  const lines: string[] = [];
  lines.push(
    `# PayTrack analytics · trailing ${days} days · generated ${new Date().toISOString()}`,
  );
  lines.push("");

  lines.push("## Summary");
  lines.push("metric,value");
  lines.push(
    row([
      "avg order-to-dispatch hours",
      avg.avgHours == null ? "" : avg.avgHours.toFixed(2),
    ]),
  );
  lines.push(row(["dispatched orders in window", avg.count]));
  lines.push(row(["orders currently on hold", holds.length]));
  lines.push("");

  lines.push("## By salesperson");
  lines.push("name,role,orders,totalValue");
  for (const r of bySalesperson)
    lines.push(row([r.name, r.role, r.orderCount, r.totalValue]));
  lines.push("");

  lines.push("## By product");
  lines.push("product,brand,orders,totalQuantity,totalValue");
  for (const r of byProduct)
    lines.push(
      row([r.name, r.brand, r.orderCount, r.totalQuantity, r.totalValue]),
    );
  lines.push("");

  lines.push("## By brand");
  lines.push("brand,orders,totalValue");
  for (const r of byBrand)
    lines.push(row([r.brand, r.orderCount, r.totalValue]));
  lines.push("");

  lines.push("## By month");
  lines.push("month,orders,totalValue");
  for (const r of byMonth)
    lines.push(row([r.month, r.orderCount, r.totalValue]));
  lines.push("");

  lines.push("## Top customers");
  lines.push("customer,orders,totalQuantity,totalValue");
  for (const r of top)
    lines.push(row([r.name, r.orderCount, r.totalQuantity, r.totalValue]));
  lines.push("");

  lines.push("## Orders on hold");
  lines.push("orderNumber,customer,salesperson,reasonCategory,reason,heldSince");
  for (const h of holds)
    lines.push(
      row([
        h.orderNumber,
        h.customer,
        h.salesperson,
        h.reasonCategory,
        h.reason,
        h.heldSince.toISOString(),
      ]),
    );

  const body = lines.join("\n") + "\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paytrack-analytics-${days}d.csv"`,
    },
  });
}
