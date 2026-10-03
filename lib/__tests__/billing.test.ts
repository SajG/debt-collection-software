/**
 * SY28 — subscription billing state machine + plan entitlements.
 *
 * planTransition() is the whole webhook decision: which Razorpay event
 * flips an org to ACTIVE, which to PAST_DUE / LOCKED, and which are ignored. The
 * route only resolves the org and writes the patch.
 */
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  planTransition,
  financialYear,
  splitGst,
  type BillingWebhookPayload,
  type OrgBillingState,
  type PlanLookup,
} from "../billing/events";
import { verifyBillingSignature } from "../billing/razorpay";
import {
  PLANS,
  chargeAmountPaise,
  entitlementsFor,
  getPlan,
  isUpgrade,
} from "../plans";

const lookup: PlanLookup = (id) =>
  ({
    plan_starter_m: { planId: "starter", cycle: "monthly" },
    plan_growth_m: { planId: "growth", cycle: "monthly" },
  })[id] as ReturnType<PlanLookup> ?? null;

function event(name: string, over: Partial<{ planId: string; subId: string; payment: boolean }> = {}): BillingWebhookPayload {
  return {
    event: name,
    payload: {
      subscription: {
        entity: {
          id: over.subId ?? "sub_1",
          plan_id: over.planId ?? "plan_growth_m",
          status: name.split(".")[1]!,
          current_start: 1_790_000_000,
          current_end: 1_792_592_000,
          charge_at: 1_792_592_000,
        },
      },
      ...(over.payment ? { payment: { entity: { id: "pay_1", amount: 589_882 } } } : {}),
    },
  };
}

const trialOrg: OrgBillingState = {
  plan: "TRIAL",
  status: "ACTIVE",
  billingExempt: false,
  razorpaySubscriptionId: "sub_1",
  pendingPlan: null,
};
const paidOrg: OrgBillingState = { ...trialOrg, plan: "GROWTH" };
const lockedTrial: OrgBillingState = { ...trialOrg, status: "LOCKED" };

describe("planTransition", () => {
  it("activates a trial org on first charge and issues an invoice", () => {
    const t = planTransition(event("subscription.charged", { payment: true }), trialOrg, lookup);
    expect(t.kind).toBe("apply");
    if (t.kind !== "apply") return;
    expect(t.patch).toMatchObject({ plan: "GROWTH", status: "ACTIVE", billingCycle: "monthly", lockReason: null });
    expect(t.patch.currentPeriodEnd).toEqual(new Date(1_792_592_000 * 1000));
    expect(t.issueInvoice).toBe(true);
  });

  it("unlocks a LOCKED trial org when it subscribes", () => {
    const t = planTransition(event("subscription.activated"), lockedTrial, lookup);
    expect(t.kind === "apply" && t.patch.status).toBe("ACTIVE");
    expect(t.kind === "apply" && t.issueInvoice).toBe(false);
  });

  it("moves a paid org to PAST_DUE (still writable) when a renewal fails", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    for (const name of ["subscription.pending", "subscription.halted", "payment.failed"]) {
      const t = planTransition(event(name), paidOrg, lookup, now);
      expect(t.kind === "apply" && t.patch).toMatchObject({ status: "PAST_DUE", pastDueSince: now });
      expect(t.kind === "apply" && t.patch.lockReason).toBeUndefined();
    }
  });

  it("keeps the original pastDueSince on retries, so the grace isn't extended", () => {
    const t = planTransition(event("subscription.halted"), { ...paidOrg, status: "PAST_DUE" }, lookup);
    expect(t.kind === "apply" && t.patch.status).toBe("PAST_DUE");
    expect(t.kind === "apply" && "pastDueSince" in t.patch && t.patch.pastDueSince).toBeFalsy();
  });

  it("a failure on an already LOCKED org leaves it locked", () => {
    const t = planTransition(event("subscription.halted"), { ...paidOrg, status: "LOCKED" }, lookup);
    expect(t.kind === "apply" && t.patch.status).toBeUndefined();
  });

  it("paying again clears PAST_DUE / LOCKED", () => {
    const t = planTransition(event("subscription.charged", { payment: true }), { ...paidOrg, status: "LOCKED" }, lookup);
    expect(t.kind === "apply" && t.patch).toMatchObject({
      status: "ACTIVE",
      lockReason: null,
      lockedAt: null,
      pastDueSince: null,
    });
  });

  it("cancellation keeps access until the end of the paid period", () => {
    const now = new Date(1_791_000_000 * 1000); // before current_end
    const t = planTransition(event("subscription.cancelled"), paidOrg, lookup, now);
    expect(t.kind === "apply" && t.patch).toMatchObject({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(1_792_592_000 * 1000),
    });
    expect(t.kind === "apply" && t.patch.status).toBeUndefined();
  });

  it("cancellation after the paid period has ended locks now", () => {
    const now = new Date(1_793_000_000 * 1000); // after current_end
    const t = planTransition(event("subscription.completed"), paidOrg, lookup, now);
    expect(t.kind === "apply" && t.patch).toMatchObject({
      status: "LOCKED",
      lockReason: "CANCELLED",
      lockedAt: now,
      cancelAtPeriodEnd: false,
    });
  });

  it("does not lock a trial org for a failed first charge or abandoned checkout", () => {
    for (const name of ["subscription.pending", "subscription.cancelled", "payment.failed"]) {
      const t = planTransition(event(name), trialOrg, lookup);
      expect(t.kind === "apply" && t.patch.status).toBeUndefined();
    }
  });

  it("ignores events for a superseded subscription", () => {
    const t = planTransition(event("subscription.cancelled", { subId: "sub_old" }), paidOrg, lookup);
    expect(t).toEqual({ kind: "ignore", reason: "event for a superseded subscription" });
  });

  it("never re-plans or locks a billing-exempt org", () => {
    const exempt = { ...paidOrg, plan: "BUSINESS" as const, billingExempt: true };
    for (const name of ["subscription.charged", "subscription.halted"]) {
      const t = planTransition(event(name), exempt, lookup);
      expect(t.kind === "apply" && t.patch.status).toBeUndefined();
      expect(t.kind === "apply" && t.patch.plan).toBeUndefined();
    }
  });

  it("clears a scheduled downgrade once the subscription carries it", () => {
    const t = planTransition(
      event("subscription.charged", { planId: "plan_starter_m" }),
      { ...paidOrg, pendingPlan: "STARTER" },
      lookup,
    );
    expect(t.kind === "apply" && t.patch).toMatchObject({ plan: "STARTER", pendingPlan: null });
  });

  it("ignores unknown plan ids rather than guessing", () => {
    const t = planTransition(event("subscription.activated", { planId: "plan_x" }), trialOrg, lookup);
    expect(t.kind).toBe("ignore");
  });
});

describe("verifyBillingSignature", () => {
  const body = '{"event":"subscription.charged"}';
  const sig = createHmac("sha256", "s3cret").update(body).digest("hex");

  it("accepts the right HMAC and rejects anything else", () => {
    expect(verifyBillingSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyBillingSignature(body, sig, "other")).toBe(false);
    expect(verifyBillingSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(verifyBillingSignature(body, null, "s3cret")).toBe(false);
  });
});

describe("GST + invoice numbering", () => {
  it("splits a GST-inclusive total back into taxable + 18%", () => {
    expect(splitGst(chargeAmountPaise(getPlan("growth"), "monthly")!, 0.18)).toEqual({
      taxablePaise: 499_900,
      gstPaise: 89_982,
    });
  });

  it("uses the Indian financial year in IST", () => {
    expect(financialYear(new Date("2026-03-31T18:29:00Z"))).toBe("2025-26"); // 23:59 IST 31 Mar
    expect(financialYear(new Date("2026-03-31T18:31:00Z"))).toBe("2026-27"); // 00:01 IST 1 Apr
  });
});

describe("plan entitlements", () => {
  it("gives trials Growth entitlements", () => {
    expect(entitlementsFor("TRIAL")).toEqual({
      planId: "growth",
      seatLimit: 20,
      flags: { tallyLiveSync: true, whatsappSending: true },
    });
  });

  it("keeps Starter off Tally live sync and WhatsApp", () => {
    expect(entitlementsFor("STARTER").flags).toEqual({ tallyLiveSync: false, whatsappSending: false });
    expect(entitlementsFor("STARTER").seatLimit).toBe(5);
  });

  it("gives Business unlimited users", () => {
    expect(entitlementsFor("BUSINESS").seatLimit).toBeNull();
  });

  it("orders plans for upgrade/downgrade", () => {
    expect(isUpgrade("starter", "growth")).toBe(true);
    expect(isUpgrade("growth", "starter")).toBe(false);
  });

  it("only self-serve plans have a price", () => {
    for (const p of PLANS) {
      expect(p.selfServe).toBe(p.monthlyINR !== null);
    }
  });
});
