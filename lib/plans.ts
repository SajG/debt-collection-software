// SY26 — single source of truth for pricing plans.
//
// Used by the marketing /pricing page and by the SY28 billing module
// (Razorpay subscriptions, seat limits, feature gates). Keep display
// strings and machine-readable amounts in sync so a plan tweak flows
// to every surface from one file.
//
// Amounts are exclusive of GST — the UI adds "+ GST" where shown, and
// the Razorpay plan is created at amount × (1 + GST_RATE).
// Trial: 14 days on every plan, no card required.
//
// PURE — no db / env access, so vitest and client components can
// import it.

export type PlanId = "starter" | "growth" | "business";

/** Mirrors the Prisma OrgPlan enum without importing @prisma/client. */
export type OrgPlanValue = "TRIAL" | "STARTER" | "GROWTH" | "BUSINESS";

export type BillingCycle = "monthly" | "annual";

export type PlanFeatures = {
  /** Windows connector pushing Tally data into Syncit. */
  tallyLiveSync: boolean;
  /** Outbound WhatsApp reminders / documents. */
  whatsappSending: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyINR: number | null;   // null = talk to us
  annualINR: number | null;    // 2 months free per the brief
  /** Active users allowed in the organization. null = unlimited. */
  seatLimit: number | null;
  flags: PlanFeatures;
  /** Self-serve checkout via Razorpay. false = sales-assisted. */
  selfServe: boolean;
  ctaLabel: string;
  ctaHref: string;
  highlight?: boolean;
  features: string[];
  featureNote?: string;
};

const ANNUAL_MULTIPLIER = 10; // 12 months billed as 10 = 2 months free

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For a small sales team with one office user",
    monthlyINR: 1_999,
    annualINR: 1_999 * ANNUAL_MULTIPLIER,
    seatLimit: 5,
    flags: { tallyLiveSync: false, whatsappSending: false },
    selfServe: true,
    ctaLabel: "Start 14-day trial",
    ctaHref: "/signup?plan=starter",
    features: [
      "Up to 5 users",
      "Orders + dispatch + invoice",
      "Follow-ups + promise-to-pay tracking",
      "Excel import + export",
      "Mobile app for Sales and Factory",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Once outstanding is a full-time job",
    monthlyINR: 4_999,
    annualINR: 4_999 * ANNUAL_MULTIPLIER,
    seatLimit: 20,
    flags: { tallyLiveSync: true, whatsappSending: true },
    selfServe: true,
    highlight: true,
    ctaLabel: "Start 14-day trial",
    ctaHref: "/signup?plan=growth",
    features: [
      "Up to 20 users",
      "Everything in Starter",
      "Tally live sync (Windows connector)",
      "WhatsApp reminders + UPI payment links",
      "Daily chase list + credit-limit alerts",
      "Priority WhatsApp support",
    ],
  },
  {
    id: "business",
    name: "Business",
    tagline: "Multiple offices or heavy volume",
    monthlyINR: null,
    annualINR: null,
    seatLimit: null,
    flags: { tallyLiveSync: true, whatsappSending: true },
    selfServe: false,
    ctaLabel: "Talk to us",
    ctaHref: "/contact?plan=business",
    features: [
      "Unlimited users",
      "Everything in Growth",
      "Custom Tally / Zoho / QuickBooks mappings",
      "Dedicated onboarding + training",
      "SLA + Slack shared channel",
      "Data residency in India (default)",
    ],
    featureNote: "Talk to us for a live walkthrough and quote.",
  },
];

export const TRIAL_DAYS = 14;
export const CURRENCY = "INR";
/** GST on SaaS (SAC 998314 — IT design & development services). */
export const GST_RATE = 0.18;
export const SAC_CODE = "998314";

/** Trials get Growth entitlements so the owner can try everything. */
export const TRIAL_ENTITLEMENT_PLAN: PlanId = "growth";

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function planIdFromOrgPlan(plan: OrgPlanValue): PlanId | null {
  switch (plan) {
    case "STARTER":
      return "starter";
    case "GROWTH":
      return "growth";
    case "BUSINESS":
      return "business";
    case "TRIAL":
      return null;
  }
}

export function orgPlanFromPlanId(id: PlanId): Exclude<OrgPlanValue, "TRIAL"> {
  return id.toUpperCase() as Exclude<OrgPlanValue, "TRIAL">;
}

export type Entitlements = {
  planId: PlanId;
  seatLimit: number | null;
  flags: PlanFeatures;
};

/** What an organization on `plan` may do. TRIAL → Growth entitlements. */
export function entitlementsFor(plan: OrgPlanValue): Entitlements {
  const resolved = getPlan(planIdFromOrgPlan(plan) ?? TRIAL_ENTITLEMENT_PLAN);
  return { planId: resolved.id, seatLimit: resolved.seatLimit, flags: resolved.flags };
}

/** Pre-GST amount in rupees, or null for sales-assisted plans. */
export function basePriceINR(plan: Plan, cycle: BillingCycle): number | null {
  return cycle === "monthly" ? plan.monthlyINR : plan.annualINR;
}

/** GST-inclusive amount in paise — what Razorpay actually charges. */
export function chargeAmountPaise(plan: Plan, cycle: BillingCycle): number | null {
  const base = basePriceINR(plan, cycle);
  if (base === null) return null;
  return Math.round(base * (1 + GST_RATE) * 100);
}

/** Plans ordered by capability, for upgrade/downgrade direction. */
const PLAN_RANK: Record<PlanId, number> = { starter: 1, growth: 2, business: 3 };

export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return PLAN_RANK[to] > PLAN_RANK[from];
}

export function priceLabel(plan: Plan, cycle: "monthly" | "annual"): string {
  const amount = cycle === "monthly" ? plan.monthlyINR : plan.annualINR;
  if (amount === null) return "Talk to us";
  const inr = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount);
  return cycle === "monthly" ? `₹${inr}/mo` : `₹${inr}/yr`;
}
