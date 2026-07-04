import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import { startOfToday } from "@/lib/ar/balance";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyRow,
  statusTone,
} from "../_components/ui";

export default async function ActionsPage() {
  const profile = await requireProfile();
  const scope = { party: partyScopeWhere(profile) };

  const [upcoming, recent] = await Promise.all([
    db.action.findMany({
      where: { ...scope, nextFollowUpDate: { gte: startOfToday() } },
      include: { party: { select: { id: true, name: true, totalOutstanding: true } } },
      orderBy: { nextFollowUpDate: "asc" },
      take: 100,
    }),
    db.action.findMany({
      where: scope,
      include: {
        party: { select: { id: true, name: true } },
        performedBy: { select: { ownerName: true } },
      },
      orderBy: { performedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="p-8">
      <PageHeader
        title="Follow-ups"
        subtitle="Scheduled and recent payment follow-ups."
        action={<LinkButton href="/actions/new">Log follow-up</LinkButton>}
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Scheduled
        </h2>
        <Table>
          <thead>
            <tr>
              <Th>Follow up on</Th>
              <Th>Party</Th>
              <Th align="right">Outstanding</Th>
              <Th>Last outcome</Th>
              <Th>Notes</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 ? (
              <EmptyRow colSpan={6} message="Nothing scheduled." />
            ) : (
              upcoming.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <Td>
                    <span className="font-medium">
                      {a.nextFollowUpDate ? formatDate(a.nextFollowUpDate) : "—"}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/parties/${a.party.id}`} className="hover:underline">
                      {a.party.name}
                    </Link>
                  </Td>
                  <Td align="right">{formatINR(a.party.totalOutstanding)}</Td>
                  <Td>
                    {a.outcome ? (
                      <Badge tone={statusTone(a.outcome)}>{a.outcome}</Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <span className="text-muted-foreground">{a.notes ?? "—"}</span>
                  </Td>
                  <Td>
                    <Link
                      href={`/actions/${a.id}/edit`}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Recent</h2>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Party</Th>
              <Th>Type</Th>
              <Th>Outcome</Th>
              <Th>Notes</Th>
              <Th>By</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <EmptyRow colSpan={7} message="No follow-ups logged yet." />
            ) : (
              recent.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <Td>{formatDate(a.performedAt)}</Td>
                  <Td>
                    <Link href={`/parties/${a.party.id}`} className="hover:underline">
                      {a.party.name}
                    </Link>
                  </Td>
                  <Td>{a.type}</Td>
                  <Td>
                    {a.outcome ? (
                      <Badge tone={statusTone(a.outcome)}>{a.outcome}</Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <span className="text-muted-foreground">{a.notes ?? "—"}</span>
                  </Td>
                  <Td>{a.performedBy.ownerName}</Td>
                  <Td>
                    <Link
                      href={`/actions/${a.id}/edit`}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
