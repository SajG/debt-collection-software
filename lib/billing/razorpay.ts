// SY28 — Razorpay Subscriptions client for Syncit's OWN billing.
//
// SERVER-ONLY. Uses the platform-level RAZORPAY_PLATFORM_* keys — a
// separate Razorpay account/key pair from RAZORPAY_KEY_ID, which an
// org uses to collect from its customers (lib/payments/razorpay.ts).
// Never mix the two: a subscription created on the org's keys would
// pay the distributor instead of Syncit.
//
// REST via fetch, no SDK — same pattern as lib/payments/razorpay.ts.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingCycle, PlanId } from "../plans";
import type { PlanLookup, SubscriptionEntity } from "./events";

const API_BASE = "https://api.razorpay.com/v1";

export function billingConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_PLATFORM_KEY_ID && process.env.RAZORPAY_PLATFORM_KEY_SECRET,
  );
}

function authHeader(): string {
  const creds = `${process.env.RAZORPAY_PLATFORM_KEY_ID}:${process.env.RAZORPAY_PLATFORM_KEY_SECRET}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

// ── plan ids ──────────────────────────────────────────────────────
// Razorpay plan ids are created once per account (scripts/
// billing-create-plans.ts prints them) and pinned in env.

const PLAN_ENV: Record<string, { planId: PlanId; cycle: BillingCycle }> = {
  RAZORPAY_PLATFORM_PLAN_STARTER_MONTHLY: { planId: "starter", cycle: "monthly" },
  RAZORPAY_PLATFORM_PLAN_STARTER_ANNUAL: { planId: "starter", cycle: "annual" },
  RAZORPAY_PLATFORM_PLAN_GROWTH_MONTHLY: { planId: "growth", cycle: "monthly" },
  RAZORPAY_PLATFORM_PLAN_GROWTH_ANNUAL: { planId: "growth", cycle: "annual" },
};

export function razorpayPlanIdFor(planId: PlanId, cycle: BillingCycle): string | null {
  const key = `RAZORPAY_PLATFORM_PLAN_${planId.toUpperCase()}_${cycle.toUpperCase()}`;
  return process.env[key] || null;
}

export const lookupRazorpayPlan: PlanLookup = (razorpayPlanId) => {
  for (const [envKey, mapped] of Object.entries(PLAN_ENV)) {
    if (process.env[envKey] && process.env[envKey] === razorpayPlanId) return mapped;
  }
  return null;
};

// ── API calls ─────────────────────────────────────────────────────

type RazorpayError = { error?: { description?: string } };

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & RazorpayError;
  if (!res.ok) {
    throw new Error(data.error?.description ?? `Razorpay ${method} ${path} failed (${res.status})`);
  }
  return data;
}

export type SubscriptionWithLink = SubscriptionEntity & { short_url: string };

/** Annual plans renew for 10 years, monthly for 10 years (120 cycles). */
const TOTAL_COUNT: Record<BillingCycle, number> = { monthly: 120, annual: 10 };

export function createSubscription(input: {
  razorpayPlanId: string;
  cycle: BillingCycle;
  organizationId: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
}): Promise<SubscriptionWithLink> {
  return call<SubscriptionWithLink>("POST", "/subscriptions", {
    plan_id: input.razorpayPlanId,
    total_count: TOTAL_COUNT[input.cycle],
    quantity: 1,
    customer_notify: 1,
    // `app` tags Syncit subs: the platform Razorpay account may also
    // bill other products, and webhooks are account-wide.
    notes: { app: "syncit", organizationId: input.organizationId },
    ...(input.ownerEmail || input.ownerPhone
      ? {
          notify_info: {
            ...(input.ownerEmail ? { notify_email: input.ownerEmail } : {}),
            ...(input.ownerPhone ? { notify_phone: input.ownerPhone } : {}),
          },
        }
      : {}),
  });
}

export function fetchSubscription(id: string): Promise<SubscriptionWithLink> {
  return call<SubscriptionWithLink>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}

/** Razorpay invoice — used to map a failed payment back to its subscription. */
export function fetchInvoice(id: string): Promise<{ id: string; subscription_id?: string | null }> {
  return call<{ id: string; subscription_id?: string | null }>(
    "GET",
    `/invoices/${encodeURIComponent(id)}`,
  );
}

/** Change plan. Upgrades apply now; downgrades at the end of the paid cycle. */
export function changeSubscriptionPlan(
  id: string,
  razorpayPlanId: string,
  when: "now" | "cycle_end",
): Promise<SubscriptionEntity> {
  return call<SubscriptionEntity>("PATCH", `/subscriptions/${encodeURIComponent(id)}`, {
    plan_id: razorpayPlanId,
    schedule_change_at: when,
    customer_notify: 1,
  });
}

export function cancelSubscription(id: string, atCycleEnd: boolean): Promise<SubscriptionEntity> {
  return call<SubscriptionEntity>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}

// ── webhook signature ─────────────────────────────────────────────

/** HMAC-SHA256 of the raw body with RAZORPAY_PLATFORM_WEBHOOK_SECRET. */
export function verifyBillingSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
