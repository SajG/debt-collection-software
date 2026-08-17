import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { formatDateTime, toNumber } from "@/lib/format";
import { PageHeader, Table, Th, Td, EmptyRow, Badge } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireProfile();
  const q = (searchParams.q ?? "").trim();

  const items = await db.stockItem.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 500,
  });

  const lastSync = items
    .map((i) => i.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Stock in factory"
        subtitle={
          lastSync
            ? `Last sync from Tally: ${formatDateTime(lastSync)}`
            : "No Tally sync recorded yet."
        }
      />

      <form className="mb-4" action="/stock" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search product or category…"
          className="w-full max-w-md rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </form>

      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Category</Th>
            <Th align="right">Available</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <EmptyRow
              colSpan={4}
              message={
                q
                  ? "No stock items match your search."
                  : "No stock yet — run the Tally sync agent to populate."
              }
            />
          ) : (
            items.map((s) => {
              const qty = toNumber(s.closingQty);
              const tone = qty <= 0 ? "danger" : qty < 10 ? "amber" : "success";
              const label = qty <= 0 ? "Out of stock" : qty < 10 ? "Low" : "In stock";
              return (
                <tr key={s.id} className="hover:bg-muted/30">
                  <Td>
                    <p className="font-medium text-foreground">{s.name}</p>
                  </Td>
                  <Td>{s.category ?? "—"}</Td>
                  <Td align="right">
                    <span className="font-mono">
                      {qty.toLocaleString("en-IN")}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {s.unit ?? ""}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={tone}>{label}</Badge>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
