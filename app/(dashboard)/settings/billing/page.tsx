import type { Metadata } from "next";
import { differenceInCalendarDays } from "date-fns";
import { requireMembership } from "@/lib/tenant";
import { formatDate } from "@/lib/format";
import { PLANS, getPlan, basePriceINR, planIdFromOrgPlan, type BillingCycle } from "@/lib/plans";
import { billingConfigured, razorpayPlanIdFor } from "@/lib/billing/razorpay";
import { getOrgBilling, listBillingInvoices } from "@/lib/platform/billing";
import { Badge, Card, PageHeader, Table, Td, Th, EmptyRow } from "../../_components/ui";
import { PlanPicker, CancelButton, type PickerPlan } from "./billing-client";

export const metadata: Metadata = { title: "Billing — Syncit" };
export const dynamic = "force-dynamic";

// SY28 — Settings → Billing. Owner-only. Readable while LOCKED (it's
// where "Choose a plan" lands); its actions are the only writes a
// locked org may make.

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LOCK_COPY: Record<string, string> = {
  TRIAL_ENDED: "Your free trial has ended.",
  PAYMENT_FAILED: "Your last payment didn't go through.",
  CANCELLED: "Your subscription has ended.",
  PAUSED: "Your subscription is paused.",
};

export default async function BillingPage() {
  const ctx = await requireMembership();

  if (!ctx.isOwner) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader title="Billing" />
        <Card>
          <p className="text-sm text-muted-foreground">
            Only the account owner can view and change the plan. Ask them to
            open Settings → Billing.
          </p>
        </Card>
      </div>
    );
  }

  const [billing, invoices] = await Promise.all([
    getOrgBilling(ctx.organizationId),
    listBillingInvoices(ctx.organizationId),
  ]);

  const currentPlanId = planIdFromOrgPlan(billing.plan);
  const planLabel =
    billing.plan === "TRIAL" ? "Free trial" : getPlan(currentPlanId ?? "business").name;
  const seatLimit = billing.entitlements.seatLimit;
  const cycle: BillingCycle = billing.billingCycle === "annual" ? "annual" : "monthly";
  const hasLiveSub =
    billing.subscriptionStatus === "active" || billing.subscriptionStatus === "authenticated";
  const trialDaysLeft =
    billing.plan === "TRIAL" && billing.trialEndsAt
      ? Math.max(0, differenceInCalendarDays(billing.trialEndsAt, new Date()))
      : null;

  const pickerPlans: PickerPlan[] = PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    seatLimit: p.seatLimit,
    features: p.features,
    selfServe: p.selfServe,
    monthlyINR: basePriceINR(p, "monthly"),
    annualINR: basePriceINR(p, "annual"),
    available: {
      monthly: p.selfServe && Boolean(razorpayPlanIdFor(p.id, "monthly")),
      annual: p.selfServe && Boolean(razorpayPlanIdFor(p.id, "annual")),
    },
  }));

  const statusBadge =
    billing.status === "LOCKED" ? (
      <Badge tone="danger">Read-only</Badge>
    ) : billing.status === "PAST_DUE" ? (
      <Badge tone="amber">Payment due</Badge>
    ) : billing.cancelAtPeriodEnd ? (
      <Badge tone="amber">Cancels at period end</Badge>
    ) : (
      <Badge tone="success">Active</Badge>
    );

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <PageHeader title="Billing" subtitle="Your plan, users, invoices and payment." />

      {billing.status === "LOCKED" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-foreground">
            {LOCK_COPY[billing.lockReason ?? ""] ?? "Your workspace is read-only."}
          </p>
          <p className="mt-1 text-muted-foreground">
            Nothing has been deleted. Everyone can still view and export data;
            choose a plan below to turn editing back on.
          </p>
        </div>
      )}

      {billing.status === "PAST_DUE" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-foreground">Your last payment didn&apos;t go through.</p>
          <p className="mt-1 text-muted-foreground">
            Everything still works for now.
            {billing.pastDueSince
              ? ` Pay by ${formatDate(new Date(billing.pastDueSince.getTime() + 7 * 24 * 60 * 60 * 1000))}`
              : " Pay within 7 days"}{" "}
            — after that the workspace becomes read-only until payment. Choosing a plan below
            starts a fresh payment.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Current plan" action={statusBadge}>
          <p className="text-xl font-semibold">{planLabel}</p>
          {trialDaysLeft !== null && billing.status !== "LOCKED" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {trialDaysLeft === 0 ? "Ends today" : `${trialDaysLeft} days left`} ·
              ends {formatDate(billing.trialEndsAt!)}
            </p>
          )}
          {billing.pendingPlan && (
            <p className="mt-1 text-sm text-muted-foreground">
              Moves to {getPlan(planIdFromOrgPlan(billing.pendingPlan) ?? "starter").name} on{" "}
              {billing.currentPeriodEnd ? formatDate(billing.currentPeriodEnd) : "renewal"}
            </p>
          )}
          {billing.billingExempt && (
            <p className="mt-1 text-sm text-muted-foreground">Billing handled by the Syncit team.</p>
          )}
        </Card>

        <Card title="Users">
          <p className="text-xl font-semibold">
            {billing.seatsUsed} <span className="text-muted-foreground font-normal">/ {seatLimit ?? "unlimited"}</span>
          </p>
          {seatLimit !== null && billing.seatsUsed >= seatLimit && (
            <p className="mt-1 text-sm text-muted-foreground">At your limit — upgrade to add more.</p>
          )}
        </Card>

        <Card title="Next charge">
          {hasLiveSub && billing.currentPeriodEnd && !billing.cancelAtPeriodEnd && currentPlanId ? (
            <>
              <p className="text-xl font-semibold">{formatDate(billing.currentPeriodEnd)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {getPlan(billing.pendingPlan ? planIdFromOrgPlan(billing.pendingPlan)! : currentPlanId).name},{" "}
                {cycle} · + 18% GST
              </p>
            </>
          ) : billing.cancelAtPeriodEnd && billing.currentPeriodEnd ? (
            <p className="text-sm text-muted-foreground">
              No further charges. Access continues until {formatDate(billing.currentPeriodEnd)}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming charge.</p>
          )}
        </Card>
      </div>

      {!billing.billingExempt && (
        <PlanPicker
          plans={pickerPlans}
          currentPlanId={billing.plan === "TRIAL" ? null : currentPlanId}
          hasLiveSubscription={billing.subscriptionStatus === "active"}
          currentCycle={cycle}
          billingConfigured={billingConfigured()}
        />
      )}

      {billing.subscriptionStatus === "active" && !billing.cancelAtPeriodEnd && (
        <Card title="Cancel subscription">
          <p className="mb-3 text-sm text-muted-foreground">
            You keep full access until the end of the period you&apos;ve paid for.
            After that the workspace becomes read-only — no data is deleted and
            export keeps working.
          </p>
          <CancelButton />
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Invoices</h2>
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Date</Th>
              <Th>Plan</Th>
              <Th align="right">Amount (incl. GST)</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <EmptyRow colSpan={5} message="No invoices yet." />
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <Td>{inv.invoiceNumber}</Td>
                  <Td>{formatDate(inv.issuedAt)}</Td>
                  <Td>
                    {getPlan(planIdFromOrgPlan(inv.plan) ?? "starter").name} · {inv.billingCycle}
                  </Td>
                  <Td align="right">{inr(inv.totalPaise)}</Td>
                  <Td align="right">
                    <a
                      href={`/api/billing/invoices/${inv.id}/pdf`}
                      className="text-primary hover:underline"
                    >
                      PDF
                    </a>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <Card title="Your data">
        <p className="text-sm text-muted-foreground">
          Export always works, on every plan and while read-only:{" "}
          <a href="/api/data/export?entity=all&format=json" className="text-primary hover:underline" download>
            download everything (JSON)
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
