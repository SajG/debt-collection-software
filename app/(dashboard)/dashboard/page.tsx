import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { AlertTriangle, Clock, IndianRupee, Truck, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { startOfToday } from "@/lib/ar/balance";
import { formatINR, formatDate } from "@/lib/format";
import { Badge, LinkButton, statusTone } from "../_components/ui";
import {
  customerName,
  deliveryUrgency,
  ORDER_STATUS_LABELS,
} from "@/lib/orders/status";
import { RefreshStatusesButton } from "./refresh-button";

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (profile.role === "FACTORY") redirect("/production");

  const settings = await db.businessSettings.findUnique({
    where: { profileId: profile.id },
    select: { onboardingDone: true },
  });
  if (!settings?.onboardingDone) redirect("/onboarding");

  // OVERDUE statuses are maintained by the daily cron pass; the header's
  // refresh button recomputes on demand. No writes in the render path.
  const scope = partyScopeWhere(profile);
  const today = startOfToday();
  const weekAhead = addDays(today, 7);

  const orderScope =
    profile.role === "ADMIN" ? {} : { salespersonId: profile.id };

  const [
    outstandingAgg,
    overduePartyCount,
    dueThisWeek,
    activePartyCount,
    overdueInvoices,
    todaysFollowUps,
    openOrdersAgg,
    myOpenOrders,
  ] = await Promise.all([
    db.party.aggregate({
      where: scope,
      _sum: { totalOutstanding: true },
    }),
    db.party.count({
      where: { ...scope, invoices: { some: { status: "OVERDUE" } } },
    }),
    db.invoice.aggregate({
      where: {
        party: scope,
        status: { in: ["UNPAID", "PARTIAL"] },
        dueDate: { gte: today, lt: weekAhead },
      },
      _sum: { totalAmount: true, paidAmount: true, creditedAmount: true },
    }),
    db.party.count({ where: { ...scope, isActive: true } }),
    db.invoice.findMany({
      where: { party: scope, status: "OVERDUE" },
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        creditedAmount: true,
        party: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    db.action.findMany({
      where: {
        party: scope,
        nextFollowUpDate: { gte: today, lt: addDays(today, 1) },
      },
      select: {
        id: true,
        type: true,
        outcome: true,
        notes: true,
        party: { select: { id: true, name: true, totalOutstanding: true } },
      },
      orderBy: { nextFollowUpDate: "asc" },
      take: 6,
    }),
    db.salesOrder.aggregate({
      where: {
        ...orderScope,
        currentStatus: { notIn: ["DISPATCHED", "CANCELLED"] },
      },
      _count: true,
      _sum: { orderValue: true },
    }),
    db.salesOrder.findMany({
      where: {
        ...orderScope,
        currentStatus: { notIn: ["DISPATCHED", "CANCELLED"] },
      },
      include: {
        party: { select: { name: true } },
        product: { select: { name: true, brand: true } },
      },
      orderBy: [
        { expectedDeliveryDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 6,
    }),
  ]);

  const totalOutstanding = outstandingAgg._sum.totalOutstanding ?? 0;
  const dueWeekAmount =
    Number(dueThisWeek._sum.totalAmount ?? 0) -
    Number(dueThisWeek._sum.paidAmount ?? 0) -
    Number(dueThisWeek._sum.creditedAmount ?? 0);

  const firstName = profile.ownerName.split(" ")[0];

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Good morning, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s your accounts receivable summary for today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/orders/new">+ New order</LinkButton>
          <RefreshStatusesButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <StatCard
          label="Total outstanding"
          value={formatINR(totalOutstanding)}
          icon={IndianRupee}
          accent="primary"
        />
        <StatCard
          label="Overdue parties"
          value={String(overduePartyCount)}
          icon={AlertTriangle}
          accent="danger"
        />
        <StatCard
          label="Due this week"
          value={formatINR(dueWeekAmount)}
          icon={Clock}
          accent="amber"
        />
        <StatCard
          label="Open orders"
          value={`${openOrdersAgg._count} · ${formatINR(openOrdersAgg._sum.orderValue ?? 0)}`}
          icon={Truck}
          accent="neutral"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Overdue invoices" viewAllHref="/invoices?filter=overdue">
          {overdueInvoices.length === 0 ? (
            <PanelEmpty message="No overdue invoices. Well collected!" />
          ) : (
            <ul className="divide-y divide-border/60">
              {overdueInvoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/parties/${inv.party.id}`} className="hover:underline">
                        {inv.party.name}
                      </Link>{" "}
                      · due {formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatINR(
                      inv.totalAmount.minus(inv.paidAmount).minus(inv.creditedAmount)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Open orders" viewAllHref="/orders">
          {myOpenOrders.length === 0 ? (
            <PanelEmpty message="No open orders. Tap + New order to place one." />
          ) : (
            <ul className="divide-y divide-border/60">
              {myOpenOrders.map((o) => {
                const urgency = deliveryUrgency(o.expectedDeliveryDate);
                const deliveryCls =
                  urgency === "overdue"
                    ? "text-red-700 font-semibold"
                    : urgency === "today"
                      ? "text-amber-700 font-semibold"
                      : "text-muted-foreground";
                return (
                  <li key={o.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/orders/${o.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {customerName(o)}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="font-mono">{o.orderNumber}</span> ·{" "}
                        {o.product.brand}
                        {o.expectedDeliveryDate && (
                          <>
                            {" · "}
                            <span className={deliveryCls}>
                              {formatDate(o.expectedDeliveryDate)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <Badge tone={statusTone(o.currentStatus)}>
                      {ORDER_STATUS_LABELS[o.currentStatus]}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Today's follow-ups" viewAllHref="/actions">
          {todaysFollowUps.length === 0 ? (
            <PanelEmpty message="No follow-ups scheduled for today." />
          ) : (
            <ul className="divide-y divide-border/60">
              {todaysFollowUps.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link
                      href={`/parties/${a.party.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {a.party.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {a.outcome ? (
                        <Badge tone={statusTone(a.outcome)}>{a.outcome}</Badge>
                      ) : (
                        a.type
                      )}
                      {a.notes ? ` · ${a.notes.slice(0, 60)}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatINR(a.party.totalOutstanding)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

type Accent = "primary" | "danger" | "amber" | "neutral";

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: Accent;
}) {
  const iconStyles: Record<Accent, string> = {
    primary: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    amber: "bg-accent/10 text-accent",
    neutral: "bg-muted text-muted-foreground",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <div className={`rounded-lg p-2 ${iconStyles[accent]}`}>
          <Icon size={18} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  viewAllHref,
  children,
}: {
  title: string;
  viewAllHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Link href={viewAllHref} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      {children}
    </div>
  );
}

function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
