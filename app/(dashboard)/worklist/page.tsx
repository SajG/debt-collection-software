import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatINR } from "@/lib/format";
import { AGING_BUCKETS, AGING_LABELS, agingSummary } from "@/lib/ar/aging";
import { scoreParty } from "@/lib/ar/refresh";
import { refreshOverdueStatuses } from "@/lib/ar/balance";
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

export default async function WorklistPage() {
  const profile = await requireProfile();
  const scope = partyScopeWhere(profile);

  await db.$transaction((tx) => refreshOverdueStatuses(tx));

  const [openInvoices, parties] = await Promise.all([
    db.invoice.findMany({
      where: {
        party: scope,
        status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      select: { dueDate: true, totalAmount: true, paidAmount: true },
    }),
    db.party.findMany({
      where: { ...scope, isActive: true, totalOutstanding: { gt: 0 } },
      take: 100,
    }),
  ]);

  const aging = agingSummary(
    openInvoices.map((inv) => ({
      dueDate: inv.dueDate,
      pending: Number(inv.totalAmount.minus(inv.paidAmount)),
    }))
  );

  const scored = await Promise.all(
    parties.map(async (party) => ({ party, risk: await scoreParty(party) }))
  );
  scored.sort(
    (a, b) =>
      b.risk.score - a.risk.score ||
      Number(b.party.totalOutstanding) - Number(a.party.totalOutstanding)
  );

  return (
    <div className="p-8">
      <PageHeader
        title="Worklist"
        subtitle="Who to follow up with today, ordered by risk and amount at stake."
      />

      {/* Aging buckets */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {AGING_BUCKETS.map((bucket) => (
          <div
            key={bucket}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {AGING_LABELS[bucket]}
            </p>
            <p
              className={`mt-1.5 text-lg font-semibold ${
                bucket === "d90_plus" && aging[bucket] > 0
                  ? "text-red-600"
                  : "text-foreground"
              }`}
            >
              {formatINR(aging[bucket])}
            </p>
          </div>
        ))}
      </div>

      <Table>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Party</Th>
            <Th align="right">Outstanding</Th>
            <Th>Risk</Th>
            <Th>Why</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {scored.length === 0 ? (
            <EmptyRow
              colSpan={6}
              message="Nothing to chase — no parties with an outstanding balance."
            />
          ) : (
            scored.map(({ party, risk }, i) => (
              <tr key={party.id} className="hover:bg-muted/30">
                <Td>
                  <span className="text-muted-foreground">{i + 1}</span>
                </Td>
                <Td>
                  <Link
                    href={`/parties/${party.id}`}
                    className="font-medium hover:underline"
                  >
                    {party.name}
                  </Link>
                  {party.outreachPaused && (
                    <span className="ml-2">
                      <Badge tone="amber">Outreach paused</Badge>
                    </span>
                  )}
                </Td>
                <Td align="right">
                  <span className="font-semibold">
                    {formatINR(party.totalOutstanding)}
                  </span>
                </Td>
                <Td>
                  <Badge tone={statusTone(risk.level)}>
                    {risk.level} · {risk.score}
                  </Badge>
                </Td>
                <Td>
                  <span className="text-xs text-muted-foreground">
                    {risk.reasons.join(" · ") || "—"}
                  </span>
                </Td>
                <Td>
                  <Link
                    href={`/actions/new?partyId=${party.id}`}
                    className="whitespace-nowrap text-xs text-primary hover:underline"
                  >
                    Log follow-up
                  </Link>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <p className="mt-4 text-xs text-muted-foreground">
        Risk scores are recomputed live from days overdue, exposure, and payment
        behaviour — every score comes with its reasons.
      </p>
      <div className="mt-6">
        <LinkButton href="/actions" variant="secondary">
          View all follow-ups
        </LinkButton>
      </div>
    </div>
  );
}
