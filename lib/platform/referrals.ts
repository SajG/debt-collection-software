import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";

// SY38 — "Invite another business".
//
// Every company has a short code; its link is /r/<code>. A company that
// signs up through the link is stamped with referredByOrgId. When the
// referred company makes its first payment, one ReferralReward row is
// written (unique per referred company, so a replayed webhook cannot
// pay out twice) and each side gets one month free:
//
//   * a company still on its trial has 30 days added to the trial —
//     applied here, automatically (TRIAL_EXTENDED);
//   * a company on a paid plan cannot have a month skipped from here —
//     the subscription is charged by Razorpay on its own schedule — so
//     the reward is recorded as PENDING_MANUAL and raised to the Syncit
//     team to credit by hand.
//
// Platform module (two companies are involved by definition); raw db is
// allowed here.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
export const REFERRAL_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
export const REFERRAL_FREE_DAYS = 30;

function newCode(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** The company's code, created on first use. */
export async function ensureReferralCode(organizationId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { referralCode: true },
  });
  if (org?.referralCode) return org.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    try {
      // updateMany + referralCode: null → two concurrent requests can't
      // overwrite each other's code.
      const res = await db.organization.updateMany({
        where: { id: organizationId, referralCode: null },
        data: { referralCode: code },
      });
      if (res.count === 1) return code;
      const again = await db.organization.findUnique({
        where: { id: organizationId },
        select: { referralCode: true },
      });
      if (again?.referralCode) return again.referralCode;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Could not allocate a referral code");
}

export function normaliseReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
}

/** Does this code belong to a live company? (For the /r/<code> page.) */
export async function referralCodeExists(code: string): Promise<boolean> {
  const c = normaliseReferralCode(code);
  if (!c) return false;
  const org = await db.organization.findFirst({
    where: { referralCode: c, deletedAt: null },
    select: { id: true },
  });
  return org !== null;
}

/** Stamp a brand-new company with who referred it. No-op for an
 *  unknown code, a self-referral, or a company already stamped. */
export async function attachReferral(newOrgId: string, rawCode: string | null | undefined): Promise<boolean> {
  const code = normaliseReferralCode(rawCode);
  if (!code) return false;
  const referrer = await db.organization.findFirst({
    where: { referralCode: code, deletedAt: null },
    select: { id: true },
  });
  if (!referrer || referrer.id === newOrgId) return false;
  const res = await db.organization.updateMany({
    where: { id: newOrgId, referredByOrgId: null },
    data: { referredByOrgId: referrer.id },
  });
  return res.count === 1;
}

type Outcome = "TRIAL_EXTENDED" | "PENDING_MANUAL";

async function giveFreeMonth(organizationId: string, now: Date): Promise<Outcome> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, trialEndsAt: true, status: true, lockReason: true, billingExempt: true },
  });
  if (!org || org.plan !== "TRIAL" || org.billingExempt) return "PENDING_MANUAL";
  const from = org.trialEndsAt && org.trialEndsAt > now ? org.trialEndsAt : now;
  const trialEndsAt = new Date(from.getTime() + REFERRAL_FREE_DAYS * 24 * 60 * 60 * 1000);
  const reopen = org.status === "LOCKED" && org.lockReason === "TRIAL_ENDED";
  await db.organization.update({
    where: { id: organizationId },
    data: {
      trialEndsAt,
      ...(reopen ? { status: "ACTIVE", lockedAt: null, lockReason: null } : {}),
    },
  });
  return "TRIAL_EXTENDED";
}

/**
 * Call when a company's payment has been received. Pays the referral
 * reward the first time only. Returns null when there is nothing to do
 * (not referred, or already rewarded).
 */
export async function grantReferralReward(
  referredOrgId: string,
  now: Date = new Date(),
): Promise<{ referrerOrgId: string; referrerOutcome: Outcome; referredOutcome: Outcome } | null> {
  const referred = await db.organization.findUnique({
    where: { id: referredOrgId },
    select: { referredByOrgId: true },
  });
  const referrerOrgId = referred?.referredByOrgId;
  if (!referrerOrgId || referrerOrgId === referredOrgId) return null;

  // Claim first: the unique index on referredOrgId makes this the gate.
  let rewardId: string;
  try {
    const row = await db.referralReward.create({
      data: { referrerOrgId, referredOrgId, referrerOutcome: "PENDING_MANUAL", referredOutcome: "PENDING_MANUAL" },
      select: { id: true },
    });
    rewardId = row.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }

  const referrerOutcome = await giveFreeMonth(referrerOrgId, now);
  const referredOutcome = await giveFreeMonth(referredOrgId, now);
  await db.referralReward.update({
    where: { id: rewardId },
    data: { referrerOutcome, referredOutcome },
  });

  if (referrerOutcome === "PENDING_MANUAL" || referredOutcome === "PENDING_MANUAL") {
    // Not an error in the code — a to-do for a person. Sentry is where
    // the team already looks.
    await captureError(new Error("Referral reward needs a manual one-month credit"), {
      scope: "referral.reward",
      rewardId,
      referrerOrgId,
      referredOrgId,
      referrerOutcome,
      referredOutcome,
    });
  }
  return { referrerOrgId, referrerOutcome, referredOutcome };
}

/** For Settings → "Invite another business". */
export async function referralSummary(organizationId: string): Promise<{
  code: string;
  signedUp: number;
  rewarded: number;
  pendingManual: number;
}> {
  const code = await ensureReferralCode(organizationId);
  const [signedUp, rewards] = await Promise.all([
    db.organization.count({ where: { referredByOrgId: organizationId, deletedAt: null } }),
    db.referralReward.findMany({
      where: { referrerOrgId: organizationId },
      select: { referrerOutcome: true },
    }),
  ]);
  return {
    code,
    signedUp,
    rewarded: rewards.length,
    pendingManual: rewards.filter((r) => r.referrerOutcome === "PENDING_MANUAL").length,
  };
}
