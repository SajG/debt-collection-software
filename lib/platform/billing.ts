import { Prisma, type BillingInvoice } from "@prisma/client";
import { db } from "@/lib/db";
import { tenantDb, type TenantTx } from "@/lib/tenant";
import {
  GST_RATE,
  entitlementsFor,
  getPlan,
  type BillingCycle,
  type Entitlements,
  type PlanFeatures,
  type PlanId,
} from "@/lib/plans";
import { financialYear, splitGst } from "@/lib/billing/events";

// SY28 — billing reads/writes that need raw db (org-agnostic surface,
// see lib/platform/orgs.ts). Pure plan logic lives in lib/plans.ts and
// lib/billing/events.ts.

export type OrgBilling = {
  id: string;
  name: string;
  plan: "TRIAL" | "STARTER" | "GROWTH" | "BUSINESS";
  status: "ACTIVE" | "PAST_DUE" | "LOCKED" | "DELETING" | "DELETED";
  trialEndsAt: Date | null;
  billingExempt: boolean;
  razorpaySubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  currentPeriodEnd: Date | null;
  pendingPlan: "TRIAL" | "STARTER" | "GROWTH" | "BUSINESS" | null;
  cancelAtPeriodEnd: boolean;
  lockReason: string | null;
  pastDueSince: Date | null;
  entitlements: Entitlements;
  seatsUsed: number;
};

/** Users who can sign in to this org. Admin deactivation flips
 *  Profile.isActive but leaves the Membership row, so require both. */
export async function countActiveSeats(organizationId: string): Promise<number> {
  return db.membership.count({
    where: { organizationId, isActive: true, profile: { isActive: true } },
  });
}

export async function getOrgBilling(organizationId: string): Promise<OrgBilling> {
  const [org, seatsUsed] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        plan: true,
        status: true,
        trialEndsAt: true,
        billingExempt: true,
        razorpaySubscriptionId: true,
        subscriptionStatus: true,
        billingCycle: true,
        currentPeriodEnd: true,
        pendingPlan: true,
        cancelAtPeriodEnd: true,
        lockReason: true,
        pastDueSince: true,
      },
    }),
    countActiveSeats(organizationId),
  ]);
  return { ...org, entitlements: entitlementsFor(org.plan), seatsUsed };
}

export type SeatCheck =
  | { ok: true }
  | { ok: false; limit: number; used: number; planName: string; message: string };

/** Can `adding` more active users join this org on its current plan? */
export async function checkSeatAvailable(organizationId: string, adding = 1): Promise<SeatCheck> {
  const billing = await getOrgBilling(organizationId);
  const limit = billing.entitlements.seatLimit;
  if (limit === null || billing.seatsUsed + adding <= limit) return { ok: true };
  const planName =
    billing.plan === "TRIAL" ? "trial" : `${getPlan(billing.entitlements.planId).name} plan`;
  return {
    ok: false,
    limit,
    used: billing.seatsUsed,
    planName,
    message: `Your ${planName} allows ${limit} users and you have ${billing.seatsUsed}. Upgrade in Settings → Billing to add more.`,
  };
}

/** organizationId is DB NOT NULL post-SY21 but still nullable in some
 *  Prisma types; null has no plan and gets no features (SY31: no
 *  default-company fallback). */
export async function orgHasFeature(
  organizationId: string | null,
  feature: keyof PlanFeatures,
): Promise<boolean> {
  if (!organizationId) return false;
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });
  if (!org) return false;
  return entitlementsFor(org.plan).flags[feature];
}

export async function isOrgLocked(organizationId: string): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  return org?.status === "LOCKED";
}

/**
 * Run `fn` in a transaction that skips the SY28 LOCKED write guard.
 * ONLY for inbound facts that must be recorded while an org is locked
 * (customer opt-outs, payment-link status from the payment gateway).
 * Never use for user-initiated writes.
 */
export async function withLockBypass<T>(
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  // SY32 — the bypassed writes still go through tenantDb, so they can
  // only touch `organizationId`'s rows.
  return tenantDb(organizationId).$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('syncit.lock_bypass', 'on', true)`;
    return fn(tx);
  });
}

/** Billing-field writes from the owner's billing actions. */
export async function updateOrgBilling(
  organizationId: string,
  data: Pick<
    Prisma.OrganizationUpdateInput,
    "razorpaySubscriptionId" | "subscriptionStatus" | "billingCycle" | "plan" | "pendingPlan" | "cancelAtPeriodEnd"
  >,
): Promise<void> {
  await db.organization.update({ where: { id: organizationId }, data });
}

export function listBillingInvoices(organizationId: string) {
  return db.billingInvoice.findMany({
    where: { organizationId },
    orderBy: { issuedAt: "desc" },
    take: 50,
  });
}

export function findBillingInvoice(organizationId: string, id: string) {
  return db.billingInvoice.findFirst({ where: { id, organizationId } });
}

// ── GST invoice issue ─────────────────────────────────────────────

export async function issueBillingInvoice(input: {
  organizationId: string;
  planId: PlanId;
  cycle: BillingCycle;
  razorpayPaymentId: string;
  razorpayInvoiceId: string | null;
  razorpaySubscriptionId: string;
  totalPaise: number;
  periodStart: Date | null;
  periodEnd: Date | null;
}): Promise<BillingInvoice | null> {
  const existing = await db.billingInvoice.findUnique({
    where: { razorpayPaymentId: input.razorpayPaymentId },
    select: { id: true },
  });
  if (existing) return null; // already issued (webhook replay)

  const [org, settings] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { name: true, state: true },
    }),
    db.businessSettings.findUnique({
      where: { organizationId: input.organizationId },
      select: { companyGstNumber: true, companyState: true },
    }),
  ]);

  const { taxablePaise, gstPaise } = splitGst(input.totalPaise, GST_RATE);
  const issuedAt = new Date();
  const fy = financialYear(issuedAt);
  const prefix = process.env.BILLING_INVOICE_PREFIX || "SYN";

  return db.$transaction(async (tx) => {
    const [seq] = await tx.$queryRaw<{ last: number }[]>`
      INSERT INTO "BillingSequence" ("fy", "last") VALUES (${fy}, 1)
      ON CONFLICT ("fy") DO UPDATE SET "last" = "BillingSequence"."last" + 1
      RETURNING "last"
    `;
    return tx.billingInvoice.create({
      data: {
        organizationId: input.organizationId,
        invoiceNumber: `${prefix}/${fy}/${String(seq!.last).padStart(4, "0")}`,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpayInvoiceId: input.razorpayInvoiceId,
        razorpaySubscriptionId: input.razorpaySubscriptionId,
        plan: input.planId.toUpperCase() as "STARTER" | "GROWTH" | "BUSINESS",
        billingCycle: input.cycle,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        totalPaise: input.totalPaise,
        taxablePaise,
        gstPaise,
        customerName: org.name,
        customerGstin: settings?.companyGstNumber ?? null,
        customerState: settings?.companyState ?? org.state ?? null,
        issuedAt,
      },
    });
  });
}

// ── trial expiry ──────────────────────────────────────────────────

/** The company a Razorpay subscription belongs to (billing webhook). */
export async function findOrgForSubscription(
  subscriptionId: string,
  notedOrganizationId: string | undefined,
) {
  return db.organization.findFirst({
    where: notedOrganizationId
      ? { OR: [{ razorpaySubscriptionId: subscriptionId }, { id: notedOrganizationId }] }
      : { razorpaySubscriptionId: subscriptionId },
    select: {
      id: true,
      plan: true,
      status: true,
      billingExempt: true,
      razorpaySubscriptionId: true,
      pendingPlan: true,
      currentPeriodEnd: true,
    },
  });
}

/** Trials ending inside [from, to] with their owner's contact. */
export async function listTrialsEndingBetween(from: Date, to: Date) {
  return db.organization.findMany({
    where: {
      plan: "TRIAL",
      status: "ACTIVE",
      trialEndsAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      name: true,
      trialEndsAt: true,
      memberships: {
        where: { isOwner: true, isActive: true },
        select: {
          profile: { select: { email: true, ownerName: true } },
        },
        take: 1,
      },
    },
  });
}

/** Lock every non-exempt trial org whose trial has ended. Returns the orgs locked. */
export async function lockExpiredTrials(now: Date = new Date()) {
  const expired = await db.organization.findMany({
    where: {
      plan: "TRIAL",
      status: { not: "LOCKED" },
      billingExempt: false,
      trialEndsAt: { lt: now },
    },
    select: {
      id: true,
      name: true,
      memberships: {
        where: { isOwner: true, isActive: true },
        select: { profile: { select: { email: true, ownerName: true } } },
        take: 1,
      },
    },
  });
  for (const org of expired) {
    await db.organization.update({
      where: { id: org.id },
      data: { status: "LOCKED", lockedAt: now, lockReason: "TRIAL_ENDED" },
    });
  }
  return expired;
}

// ── SY34: failed-renewal grace + end-of-period cancellation ───────

const OWNER_CONTACT = {
  memberships: {
    where: { isOwner: true, isActive: true },
    select: { profile: { select: { email: true, ownerName: true } } },
    take: 1,
  },
} as const;

/** Lock every non-exempt org that has been PAST_DUE for `graceDays`. */
export async function lockExpiredPastDue(now: Date = new Date(), graceDays = 7) {
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
  const expired = await db.organization.findMany({
    where: { status: "PAST_DUE", billingExempt: false, pastDueSince: { lte: cutoff } },
    select: { id: true, name: true, ...OWNER_CONTACT },
  });
  for (const org of expired) {
    await db.organization.update({
      where: { id: org.id },
      data: { status: "LOCKED", lockedAt: now, lockReason: "PAYMENT_FAILED" },
    });
  }
  return expired;
}

/** Lock orgs whose cancelled subscription has reached the end of its paid period. */
export async function lockEndedCancellations(now: Date = new Date()) {
  const ended = await db.organization.findMany({
    where: {
      cancelAtPeriodEnd: true,
      billingExempt: false,
      status: { not: "LOCKED" },
      currentPeriodEnd: { lte: now },
    },
    select: { id: true, name: true, ...OWNER_CONTACT },
  });
  for (const org of ended) {
    await db.organization.update({
      where: { id: org.id },
      data: {
        status: "LOCKED",
        lockedAt: now,
        lockReason: "CANCELLED",
        cancelAtPeriodEnd: false,
        pastDueSince: null,
      },
    });
  }
  return ended;
}
