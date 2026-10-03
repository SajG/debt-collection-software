"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/tenant";
import { captureError } from "@/lib/monitoring";
import { getPlan, isUpgrade, orgPlanFromPlanId, planIdFromOrgPlan } from "@/lib/plans";
import {
  billingConfigured,
  cancelSubscription,
  changeSubscriptionPlan,
  createSubscription,
  fetchSubscription,
  razorpayPlanIdFor,
} from "@/lib/billing/razorpay";
import { getOrgBilling, updateOrgBilling } from "@/lib/platform/billing";

// SY28 — owner-only billing actions. Middleware lets POSTs to
// /settings/billing through while an org is LOCKED, so these are the
// only writes a locked owner can make.
//
// Razorpay is the source of truth: these actions ask Razorpay for a
// change and record what was asked for; the razorpay-billing webhook
// flips plan/status when Razorpay confirms.

export type BillingActionResult =
  | { ok: true; checkoutUrl?: string; message?: string }
  | { error: string };

const selfServePlan = z.enum(["starter", "growth"]);
const cycleSchema = z.enum(["monthly", "annual"]);

async function requireOwner() {
  const ctx = await requireMembership();
  if (!ctx.isOwner) throw new Error("Only the account owner can manage billing.");
  return ctx;
}

function failure(e: unknown, scope: string): BillingActionResult {
  void captureError(e, { scope });
  return { error: e instanceof Error ? e.message : "Something went wrong. Try again." };
}

/** Start (or resume) checkout for a plan. Returns Razorpay's hosted page URL. */
export async function subscribeAction(input: { planId: string; cycle: string }): Promise<BillingActionResult> {
  try {
    const ctx = await requireOwner();
    const planId = selfServePlan.parse(input.planId);
    const cycle = cycleSchema.parse(input.cycle);
    if (!billingConfigured()) return { error: "Online billing is not set up yet. Contact support." };

    const razorpayPlanId = razorpayPlanIdFor(planId, cycle);
    if (!razorpayPlanId) return { error: `The ${getPlan(planId).name} ${cycle} plan is not available yet.` };

    const billing = await getOrgBilling(ctx.organizationId);
    if (billing.billingExempt) return { error: "Billing for this account is handled by the Syncit team." };

    const seatLimit = getPlan(planId).seatLimit;
    if (seatLimit !== null && billing.seatsUsed > seatLimit) {
      return {
        error: `${getPlan(planId).name} allows ${seatLimit} users and you have ${billing.seatsUsed}. Deactivate users first or pick a bigger plan.`,
      };
    }

    let replaceId: string | null = null;
    if (billing.razorpaySubscriptionId) {
      const existing = await fetchSubscription(billing.razorpaySubscriptionId);
      if (["active", "authenticated"].includes(existing.status)) {
        return { error: "You already have a subscription. Use Change plan instead." };
      }
      // Checkout started earlier on the same plan and never finished — reuse it.
      if (existing.status === "created" && existing.plan_id === razorpayPlanId) {
        return { ok: true, checkoutUrl: existing.short_url };
      }
      // Anything else still live (created on another plan, pending,
      // halted, paused) is replaced and cancelled so it can't charge.
      if (["created", "pending", "halted", "paused"].includes(existing.status)) {
        replaceId = existing.id;
      }
    }

    const owner = ctx.profile;
    const sub = await createSubscription({
      razorpayPlanId,
      cycle,
      organizationId: ctx.organizationId,
      ownerEmail: owner.email,
      ownerPhone: owner.phone ? `+91${owner.phone}` : null,
    });

    await updateOrgBilling(ctx.organizationId, {
      razorpaySubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      billingCycle: cycle,
      pendingPlan: null,
      cancelAtPeriodEnd: false,
    });
    // Cancel only after the org points at the new sub, so the old
    // sub's `cancelled` webhook is ignored as superseded.
    if (replaceId) await cancelSubscription(replaceId, false).catch(() => undefined);

    revalidatePath("/settings/billing");
    return { ok: true, checkoutUrl: sub.short_url };
  } catch (e) {
    return failure(e, "billing.subscribe");
  }
}

/** Upgrade (applies now) or downgrade (applies at the end of the paid cycle). */
export async function changePlanAction(input: { planId: string }): Promise<BillingActionResult> {
  try {
    const ctx = await requireOwner();
    const target = selfServePlan.parse(input.planId);
    const billing = await getOrgBilling(ctx.organizationId);

    const current = planIdFromOrgPlan(billing.plan);
    if (!billing.razorpaySubscriptionId || billing.subscriptionStatus !== "active" || !current) {
      return { error: "No active subscription to change. Choose a plan instead." };
    }
    if (current === target) return { error: "You are already on this plan." };

    const cycle = cycleSchema.parse(billing.billingCycle ?? "monthly");
    const razorpayPlanId = razorpayPlanIdFor(target, cycle);
    if (!razorpayPlanId) return { error: "That plan is not available yet." };

    const upgrade = isUpgrade(current, target);
    const seatLimit = getPlan(target).seatLimit;
    if (!upgrade && seatLimit !== null && billing.seatsUsed > seatLimit) {
      return {
        error: `${getPlan(target).name} allows ${seatLimit} users and you have ${billing.seatsUsed}. Deactivate users before downgrading.`,
      };
    }

    await changeSubscriptionPlan(billing.razorpaySubscriptionId, razorpayPlanId, upgrade ? "now" : "cycle_end");

    await updateOrgBilling(
      ctx.organizationId,
      upgrade
        ? { plan: orgPlanFromPlanId(target), pendingPlan: null }
        : { pendingPlan: orgPlanFromPlanId(target) },
    );

    revalidatePath("/settings/billing");
    return {
      ok: true,
      message: upgrade
        ? `Upgraded to ${getPlan(target).name}.`
        : `You'll move to ${getPlan(target).name} at the end of this billing period.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/not allowed|not supported|upi/i.test(msg)) {
      return {
        error: "Your payment method doesn't support plan changes. Cancel and subscribe again on the new plan — nothing is lost.",
      };
    }
    return failure(e, "billing.change-plan");
  }
}

/** Cancel at the end of the paid period. The org locks (read-only) after that. */
export async function cancelSubscriptionAction(): Promise<BillingActionResult> {
  try {
    const ctx = await requireOwner();
    const billing = await getOrgBilling(ctx.organizationId);
    if (!billing.razorpaySubscriptionId) return { error: "No subscription to cancel." };

    await cancelSubscription(billing.razorpaySubscriptionId, true);
    await updateOrgBilling(ctx.organizationId, { cancelAtPeriodEnd: true, pendingPlan: null });

    revalidatePath("/settings/billing");
    return {
      ok: true,
      message: "Cancelled. You keep full access until the end of this billing period; after that your data stays read-only and exportable.",
    };
  } catch (e) {
    return failure(e, "billing.cancel");
  }
}
