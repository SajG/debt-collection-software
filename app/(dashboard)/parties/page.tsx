import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatINR } from "@/lib/format";
import { PAGE_SIZES, parsePageParams, pageArgs, pageResult } from "@/lib/pagination";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyRow,
  Pagination,
  statusTone,
  inputCls,
} from "../_components/ui";

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: { q?: string; cursor?: string; size?: string };
}) {
  const profile = await requireProfile();
  const q = searchParams.q?.trim() ?? "";
  const page = parsePageParams(searchParams);

  const fetched = await db.party.findMany({
    where: {
      ...partyScopeWhere(profile),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      phone: true,
      email: true,
      totalOutstanding: true,
      priority: true,
      riskLevel: true,
      isActive: true,
      assignedTo: { select: { ownerName: true } },
    },
    orderBy: [{ totalOutstanding: "desc" }, { name: "asc" }, { id: "asc" }],
    ...pageArgs(page),
  });
  const { rows: parties, hasNext, nextCursor } = pageResult(fetched, page);

  return (
    <div className="p-8">
      <PageHeader
        title="Parties"
        subtitle="Your customers and their outstanding balances."
        action={<LinkButton href="/parties/new">Add party</LinkButton>}
      />

      <form className="mb-4 max-w-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, code, or phone…"
          className={inputCls}
        />
      </form>

      <Table>
        <thead>
          <tr>
            <Th>Party</Th>
            <Th>Contact</Th>
            <Th align="right">Outstanding</Th>
            <Th>Priority</Th>
            <Th>Risk</Th>
            <Th>Assigned to</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {parties.length === 0 ? (
            <EmptyRow
              colSpan={7}
              message={
                q
                  ? "No parties match your search."
                  : "No parties yet. Add one or import from CSV."
              }
            />
          ) : (
            parties.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <Td>
                  <Link
                    href={`/parties/${p.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.code && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {p.code}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="text-muted-foreground">
                    {p.phone ?? p.email ?? "—"}
                  </span>
                </Td>
                <Td align="right">
                  <span className="font-semibold">
                    {formatINR(p.totalOutstanding)}
                  </span>
                </Td>
                <Td>
                  <Badge tone={statusTone(p.priority)}>{p.priority}</Badge>
                </Td>
                <Td>
                  <Badge tone={statusTone(p.riskLevel)}>{p.riskLevel}</Badge>
                </Td>
                <Td>
                  <span className="text-muted-foreground">
                    {p.assignedTo?.ownerName ?? "Unassigned"}
                  </span>
                </Td>
                <Td>
                  {p.isActive ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge>Inactive</Badge>
                  )}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Pagination
        pathname="/parties"
        params={{ q: q || undefined, size: searchParams.size }}
        pageSize={page.size}
        pageSizes={PAGE_SIZES}
        hasNext={hasNext}
        nextCursor={nextCursor}
        onFirstPage={!page.cursor}
      />
    </div>
  );
}
