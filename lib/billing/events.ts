// SY28 — Razorpay subscription webhook → Organization state.
//
// PURE — no db / env. The route handler resolves the org, calls
// planTransition(), writes the patch. Keeping the state machine here
// lets vitest cover every event without a database.
//
//   activated | charged | resumed | updated → ACTIVE on the plan the
//                                             subscription now carries
//                                             (clears PAST_DUE / LOCKED)
//   pending | halted | payment.failed       → PAST_DUE (SY34: 7-day grace,
//                                             still writable; the billing
//                                             cron locks after 7 days)
//   cancelled | completed                   → access until the end of the
//                                             paid period, then the cron
//                                             locks (CANCELLED); locks now
//                                             if that period already ended
//   paused                                  → LOCKED (PAUSED)
//   authenticated                           → status unchanged
//
// Failure / cancel events on a still-TRIAL org are recorded but change
// nothing: the trial end date governs until the first successful charge.
//
// Billing-exempt orgs (Synergy) record the raw subscription status but
// are never locked or re-planned by a webhook.

import type { BillingCycle, OrgPlanValue, PlanId } from "../plans";
import { orgPlanFromPlanId } from "../plans";

export type OrgStatusValue = "ACTIVE" | "PAST_DUE" | "LOCKED" | "DELETING" | "DELETED";
export type LockReason = "TRIAL_ENDED" | "PAYMENT_FAILED" | "CANCELLED" | "PAUSED";

export type SubscriptionEntity = {
  id: string;
  plan_id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  notes?: Record<string, string> | null;
};

export type PaymentEntity = {
  id: string;
  amount: number; // paise
  invoice_id?: string | null;
  /** Present on subscription payments in some payloads; else resolve via invoice_id. */
  subscription_id?: string | null;
};

export type BillingWebhookPayload = {
  event: string;
  payload: {
    subscription?: { entity: SubscriptionEntity };
    payment?: { entity: PaymentEntity };
  };
  created_at?: number;
};

export type OrgBillingState = {
  plan: OrgPlanValue;
  status: OrgStatusValue;
  billingExempt: boolean;
  razorpaySubscriptionId: string | null;
  pendingPlan: OrgPlanValue | null;
  currentPeriodEnd?: Date | null;
};

export type OrgPatch = {
  plan?: OrgPlanValue;
  status?: OrgStatusValue;
  subscriptionStatus?: string;
  billingCycle?: BillingCycle;
  currentPeriodEnd?: Date | null;
  pendingPlan?: OrgPlanValue | null;
  cancelAtPeriodEnd?: boolean;
  lockedAt?: Date | null;
  lockReason?: LockReason | null;
  pastDueSince?: Date | null;
  trialEndsAt?: null;
};

export type Transition =
  | { kind: "ignore"; reason: string }
  | { kind: "apply"; patch: OrgPatch; issueInvoice: boolean };

export type PlanLookup = (razorpayPlanId: string) => { planId: PlanId; cycle: BillingCycle } | null;

const ACTIVATING = new Set([
  "subscription.activated",
  "subscription.charged",
  "subscription.resumed",
  "subscription.updated",
]);

const PAYMENT_FAILED = new Set([
  "subscription.pending",
  "subscription.halted",
  "payment.failed",
]);

const ENDING = new Set(["subscription.cancelled", "subscription.completed"]);

/** Days a paying org stays writable after a failed renewal. */
export const PAST_DUE_GRACE_DAYS = 7;

function unixToDate(v: number | null | undefined): Date | null {
  return typeof v === "number" && v > 0 ? new Date(v * 1000) : null;
}

export function planTransition(
  body: BillingWebhookPayload,
  org: OrgBillingState,
  lookupPlan: PlanLookup,
  now: Date = new Date(),
): Transition {
  const sub = body.payload.subscription?.entity;
  if (!sub) return { kind: "ignore", reason: "no subscription entity" };

  // A late event from a subscription the org has since replaced must
  // not flip the new one (e.g. old sub's `cancelled` after resubscribe).
  if (org.razorpaySubscriptionId && org.razorpaySubscriptionId !== sub.id) {
    return { kind: "ignore", reason: "event for a superseded subscription" };
  }

  const mapped = lookupPlan(sub.plan_id);
  const base: OrgPatch = {
    subscriptionStatus: sub.status,
    currentPeriodEnd: unixToDate(sub.charge_at) ?? unixToDate(sub.current_end),
  };

  if (org.billingExempt) {
    return { kind: "apply", patch: base, issueInvoice: false };
  }

  // SY35 — a company being deleted (or already purged) is never
  // re-activated or re-locked by billing; deletion owns its status.
  if (org.status === "DELETING" || org.status === "DELETED") {
    return { kind: "apply", patch: base, issueInvoice: false };
  }

  if (body.event === "subscription.authenticated") {
    return { kind: "apply", patch: base, issueInvoice: false };
  }

  if (ACTIVATING.has(body.event)) {
    if (!mapped) return { kind: "ignore", reason: `unknown plan_id ${sub.plan_id}` };
    const plan = orgPlanFromPlanId(mapped.planId);
    return {
      kind: "apply",
      patch: {
        ...base,
        plan,
        billingCycle: mapped.cycle,
        status: "ACTIVE",
        lockedAt: null,
        lockReason: null,
        pastDueSince: null,
        trialEndsAt: null,
        // A scheduled downgrade has landed once the sub carries it.
        ...(org.pendingPlan === plan ? { pendingPlan: null } : {}),
      },
      issueInvoice: body.event === "subscription.charged" && Boolean(body.payload.payment),
    };
  }

  const isFailure = PAYMENT_FAILED.has(body.event);
  const isEnding = ENDING.has(body.event);
  const isPause = body.event === "subscription.paused";

  if ((isFailure || isEnding || isPause) && org.plan === "TRIAL") {
    // Never paid (first charge failed or checkout abandoned). The
    // trial clock, not the subscription, decides when to lock.
    return { kind: "apply", patch: base, issueInvoice: false };
  }

  if (isFailure) {
    // Already read-only (grace ran out, or paused) → stay locked.
    if (org.status === "LOCKED") return { kind: "apply", patch: base, issueInvoice: false };
    return {
      kind: "apply",
      patch: {
        ...base,
        status: "PAST_DUE",
        // Keep the original start so retries don't extend the grace.
        pastDueSince: org.status === "PAST_DUE" ? undefined : now,
      },
      issueInvoice: false,
    };
  }

  if (isEnding) {
    // Paid access runs to the end of the current period.
    const periodEnd = unixToDate(sub.current_end) ?? org.currentPeriodEnd ?? null;
    if (periodEnd && periodEnd.getTime() > now.getTime()) {
      return {
        kind: "apply",
        patch: { ...base, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true, pendingPlan: null },
        issueInvoice: false,
      };
    }
    return {
      kind: "apply",
      patch: {
        ...base,
        status: "LOCKED",
        lockedAt: org.status === "LOCKED" ? undefined : now,
        lockReason: "CANCELLED",
        cancelAtPeriodEnd: false,
        pendingPlan: null,
        pastDueSince: null,
      },
      issueInvoice: false,
    };
  }

  if (isPause) {
    return {
      kind: "apply",
      patch: {
        ...base,
        status: "LOCKED",
        lockedAt: org.status === "LOCKED" ? undefined : now,
        lockReason: "PAUSED",
      },
      issueInvoice: false,
    };
  }

  return { kind: "ignore", reason: `unhandled event ${body.event}` };
}

/** Indian financial year label for a date, e.g. 2026-27 (Apr–Mar, IST). */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Split a GST-inclusive total into taxable value + GST, in paise. */
export function splitGst(totalPaise: number, rate: number): { taxablePaise: number; gstPaise: number } {
  const taxablePaise = Math.round(totalPaise / (1 + rate));
  return { taxablePaise, gstPaise: totalPaise - taxablePaise };
}
