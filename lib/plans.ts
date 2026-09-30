// SY26 — single source of truth for pricing plans.
//
// Used by the marketing /pricing page today and by the billing
// module in SY28 (Razorpay subscriptions). Keep display strings
// and machine-readable amounts in sync so a plan tweak flows to
// both surfaces from one file.
//
// Amounts are exclusive of GST — the UI adds "+ GST" where shown.
// Trial: 14 days on every plan, no card required.

export type PlanId = "starter" | "growth" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyINR: number | null;   // null = talk to us
  annualINR: number | null;    // 2 months free per the brief
  seatLimit: number | null;
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

export function priceLabel(plan: Plan, cycle: "monthly" | "annual"): string {
  const amount = cycle === "monthly" ? plan.monthlyINR : plan.annualINR;
  if (amount === null) return "Talk to us";
  const inr = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount);
  return cycle === "monthly" ? `₹${inr}/mo` : `₹${inr}/yr`;
}
