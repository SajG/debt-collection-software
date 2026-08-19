import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { PageHeader, Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

// Reconciliation: Tally's ledger closing balance vs the app-computed
// totalOutstanding, per customer. Any mismatch beyond a small paisa-
// level tolerance points at a sync bug (missing receipts, missing
// invoices, wrong allocation, credit note not captured).
//
// The two fields on Party are populated by the Tally sync agent:
//   tallyOutstanding — CLOSINGBALANCE from the Sundry Debtors ledger
//   tallyBalanceAsOf — server-side timestamp on that sync run
// The trigger paytrack_recompute_party_outstanding keeps
// totalOutstanding in sync with app-side invoices + payments.

const TOLERANCE = new Prisma.Decimal(1); // ₹1 tolerance for rounding drift

type Row = {
  id: string;
  name: string;
  city: string | null;
  tallyOutstanding: Prisma.Decimal | null;
  totalOutstanding: Prisma.Decimal;
  tallyBalanceAsOf: Date | null;
  diff: Prisma.Decimal | null;
  status: "ok" | "mismatch" | "no_tally_snapshot";
};

function formatINR(n: Prisma.Decimal | number | null | undefined): string {
  if (n == null) return "—";
  const v = typeof n === "number" ? n : Number(n);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v);
}

function timeAgo(d: Date | null): string {
  if (!d) return "never";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export default async function ReconciliationPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const parties = await db.party.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      city: true,
      totalOutstanding: true,
      tallyOutstanding: true,
      tallyBalanceAsOf: true,
    },
    orderBy: { name: "asc" },
  });

  const rows: Row[] = parties.map((p) => {
    if (p.tallyOutstanding == null) {
      return {
        id: p.id,
        name: p.name,
        city: p.city,
        tallyOutstanding: null,
        totalOutstanding: p.totalOutstanding,
        tallyBalanceAsOf: p.tallyBalanceAsOf,
        diff: null,
        status: "no_tally_snapshot",
      };
    }
    const diff = p.totalOutstanding.minus(p.tallyOutstanding);
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      tallyOutstanding: p.tallyOutstanding,
      totalOutstanding: p.totalOutstanding,
      tallyBalanceAsOf: p.tallyBalanceAsOf,
      diff,
      status: diff.abs().lessThanOrEqualTo(TOLERANCE) ? "ok" : "mismatch",
    };
  });

  const mismatches = rows.filter((r) => r.status === "mismatch");
  const noSnapshot = rows.filter((r) => r.status === "no_tally_snapshot");
  const ok = rows.filter((r) => r.status === "ok");

  // Mismatches first, largest absolute diff at the top — that's where
  // the sync bug is loudest.
  mismatches.sort((a, b) =>
    (b.diff ?? new Prisma.Decimal(0))
      .abs()
      .comparedTo((a.diff ?? new Prisma.Decimal(0)).abs()),
  );

  const sortedRows = [...mismatches, ...noSnapshot, ...ok];

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Tally reconciliation"
        subtitle="Ledger closing balance from Tally vs the balance PayTrack computes from invoices + payments. Mismatches above ₹1 usually point at a sync bug."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Matched" value={ok.length} tone="ok" />
        <Stat
          label="Mismatched"
          value={mismatches.length}
          tone={mismatches.length > 0 ? "warn" : "ok"}
        />
        <Stat
          label="No Tally snapshot"
          value={noSnapshot.length}
          tone={noSnapshot.length > 0 ? "muted" : "ok"}
        />
      </div>

      <Card title="Per-customer balances" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3 text-right">Tally</th>
                <th className="py-2 pr-3 text-right">PayTrack</th>
                <th className="py-2 pr-3 text-right">Diff</th>
                <th className="py-2 pr-3">Last Tally sync</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    r.status === "mismatch"
                      ? "border-b bg-red-50/60"
                      : r.status === "no_tally_snapshot"
                        ? "border-b bg-slate-50/50"
                        : "border-b"
                  }
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium">{r.name}</div>
                    {r.city ? (
                      <div className="text-xs text-muted-foreground">
                        {r.city}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">
                    {formatINR(r.tallyOutstanding)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">
                    {formatINR(r.totalOutstanding)}
                  </td>
                  <td
                    className={
                      "py-2 pr-3 text-right font-mono tabular-nums " +
                      (r.status === "mismatch"
                        ? "font-semibold text-red-700"
                        : "text-muted-foreground")
                    }
                  >
                    {r.diff == null ? "—" : formatINR(r.diff)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {timeAgo(r.tallyBalanceAsOf)}
                  </td>
                  <td className="py-2 pr-3">
                    <StatusPill status={r.status} />
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Diff = PayTrack − Tally. Positive: we think the customer owes
        more than Tally does (usually a missing receipt on our side).
        Negative: we think they owe less (usually a missing invoice or
        a duplicated payment). &quot;No Tally snapshot&quot; means the
        ledger sync hasn&apos;t run since Party.tallyOutstanding was
        added — run the Tally connector to populate it.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "muted";
}) {
  const bg =
    tone === "warn"
      ? "bg-red-50 border-red-200"
      : tone === "muted"
        ? "bg-slate-50 border-slate-200"
        : "bg-emerald-50 border-emerald-200";
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: Row["status"] }) {
  if (status === "ok") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        Match
      </span>
    );
  }
  if (status === "mismatch") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        Mismatch
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
      No snapshot
    </span>
  );
}
