"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { BillingCycle, PlanId } from "@/lib/plans";
import { btnPrimaryCls, btnSecondaryCls } from "../../_components/ui";
import {
  cancelSubscriptionAction,
  changePlanAction,
  subscribeAction,
  type BillingActionResult,
} from "./actions";

export type PickerPlan = {
  id: PlanId;
  name: string;
  tagline: string;
  seatLimit: number | null;
  features: string[];
  selfServe: boolean;
  monthlyINR: number | null;
  annualINR: number | null;
  available: Record<BillingCycle, boolean>;
};

function price(v: number | null, cycle: BillingCycle): string {
  if (v === null) return "Talk to us";
  return `₹${v.toLocaleString("en-IN")}${cycle === "monthly" ? "/mo" : "/yr"}`;
}

function handle(result: BillingActionResult) {
  if ("error" in result) {
    toast.error(result.error);
    return;
  }
  if (result.checkoutUrl) {
    // Razorpay's hosted subscription page — card / UPI mandate setup.
    window.location.href = result.checkoutUrl;
    return;
  }
  if (result.message) toast.success(result.message);
}

export function PlanPicker({
  plans,
  currentPlanId,
  hasLiveSubscription,
  currentCycle,
  billingConfigured,
}: {
  plans: PickerPlan[];
  currentPlanId: PlanId | null;
  hasLiveSubscription: boolean;
  currentCycle: BillingCycle;
  billingConfigured: boolean;
}) {
  const [cycle, setCycle] = useState<BillingCycle>(currentCycle);
  const [pending, startTransition] = useTransition();
  // Plan changes keep the current cycle; the toggle only matters for new checkouts.
  const effectiveCycle = hasLiveSubscription ? currentCycle : cycle;

  function choose(plan: PickerPlan) {
    startTransition(async () => {
      handle(
        hasLiveSubscription
          ? await changePlanAction({ planId: plan.id })
          : await subscribeAction({ planId: plan.id, cycle: effectiveCycle }),
      );
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {hasLiveSubscription ? "Change plan" : "Choose a plan"}
        </h2>
        {!hasLiveSubscription && (
          <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-sm">
            {(["monthly", "annual"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={`rounded px-3 py-1 ${cycle === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {c === "monthly" ? "Monthly" : "Annual · 2 months free"}
              </button>
            ))}
          </div>
        )}
      </div>

      {!billingConfigured && (
        <p className="mb-3 text-sm text-muted-foreground">
          Online payment isn&apos;t switched on yet. Write to us and we&apos;ll set up your plan.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const amount = effectiveCycle === "monthly" ? plan.monthlyINR : plan.annualINR;
          const canBuy = billingConfigured && plan.selfServe && plan.available[effectiveCycle];
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-xl border bg-card p-5 shadow-sm ${isCurrent ? "border-primary" : "border-border"}`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{plan.name}</h3>
                {isCurrent && <span className="text-xs font-medium text-primary">Current</span>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
              <p className="mt-3 text-lg font-semibold">
                {price(amount, effectiveCycle)}
                {amount !== null && <span className="text-xs font-normal text-muted-foreground"> + GST</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {plan.seatLimit === null ? "Unlimited users" : `Up to ${plan.seatLimit} users`}
              </p>
              <ul className="mt-3 flex-1 space-y-1 text-xs text-muted-foreground">
                {plan.features.slice(1).map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <div className="mt-4">
                {!plan.selfServe ? (
                  <Link href="/contact?plan=business" className={`${btnSecondaryCls} w-full`}>
                    Talk to us
                  </Link>
                ) : isCurrent ? (
                  <button type="button" disabled className={`${btnSecondaryCls} w-full`}>
                    Current plan
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending || !canBuy}
                    onClick={() => choose(plan)}
                    className={`${btnPrimaryCls} w-full`}
                  >
                    {hasLiveSubscription ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CancelButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className={btnSecondaryCls} onClick={() => setConfirming(true)}>
        Cancel subscription
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">Cancel at the end of this billing period?</span>
      <button
        type="button"
        disabled={pending}
        className={btnPrimaryCls}
        onClick={() =>
          startTransition(async () => {
            handle(await cancelSubscriptionAction());
            setConfirming(false);
          })
        }
      >
        Yes, cancel
      </button>
      <button type="button" className={btnSecondaryCls} onClick={() => setConfirming(false)}>
        Keep plan
      </button>
    </div>
  );
}
