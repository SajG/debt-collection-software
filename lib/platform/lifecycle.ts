import { db } from "@/lib/db";

// SY38 — which lifecycle email (if any) a company is due today.
//
//   day0_welcome       age 0–1 d     (normally sent at sign-up itself)
//   day1_connect_data  age 1–2 d     unless customers/invoices are in
//   day3_invite_team   age 3–6 d     unless a second person has joined
//   day30_win_back     age 30–36 d   only if the trial ended unpaid
//
// "Trial ends in 3 days" (day 11) and "trial ended" (day 14) are
// account notices and stay with /api/cron/trial-reminders, which keys
// them off trialEndsAt so they are right even when a trial is extended.
//
// Each window is a few days wide so a missed cron run catches up, and
// OrgLifecycleEvent ("email:<key>") makes every email once-per-company.

export const LIFECYCLE_EMAILS = [
  "day0_welcome",
  "day1_connect_data",
  "day3_invite_team",
  "day30_win_back",
] as const;
export type LifecycleEmail = (typeof LIFECYCLE_EMAILS)[number];

export type LifecycleState = {
  ageDays: number;
  plan: string;
  status: string;
  lockReason: string | null;
  billingExempt: boolean;
  optedOut: boolean;
  /** Milestones reached, e.g. "tally_connected". */
  milestones: ReadonlySet<string>;
  /** Lifecycle emails already sent. */
  sent: ReadonlySet<string>;
};

const within = (age: number, from: number, to: number) => age >= from && age < to;

/** Pure. At most one email per day, earliest step first. */
export function dueLifecycleEmail(s: LifecycleState): LifecycleEmail | null {
  // Companies we set up by hand (pilot, demo) are not marketed to.
  if (s.billingExempt) return null;
  if (s.status === "DELETING" || s.status === "DELETED") return null;

  if (within(s.ageDays, 0, 2) && !s.sent.has("day0_welcome")) return "day0_welcome";
  // Everything after the welcome is a tip the owner can opt out of.
  if (s.optedOut) return null;

  if (
    within(s.ageDays, 1, 3) &&
    !s.sent.has("day1_connect_data") &&
    !s.milestones.has("tally_connected") &&
    !s.milestones.has("data_imported")
  ) {
    return "day1_connect_data";
  }
  if (within(s.ageDays, 3, 7) && !s.sent.has("day3_invite_team") && !s.milestones.has("team_invited")) {
    return "day3_invite_team";
  }
  if (
    within(s.ageDays, 30, 37) &&
    !s.sent.has("day30_win_back") &&
    s.plan === "TRIAL" &&
    s.status === "LOCKED" &&
    s.lockReason === "TRIAL_ENDED"
  ) {
    return "day30_win_back";
  }
  return null;
}

export type LifecycleOrg = {
  id: string;
  name: string;
  createdAt: Date;
  plan: string;
  status: string;
  lockReason: string | null;
  billingExempt: boolean;
  marketingEmailsOptOut: boolean;
  trialEndsAt: Date | null;
  owner: { ownerName: string; email: string | null } | null;
  events: string[];
};

/** Companies young enough to still be in the lifecycle (≤ 40 days). */
export async function listLifecycleOrgs(now: Date = new Date()): Promise<LifecycleOrg[]> {
  const since = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
  const rows = await db.organization.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    select: {
      id: true,
      name: true,
      createdAt: true,
      plan: true,
      status: true,
      lockReason: true,
      billingExempt: true,
      marketingEmailsOptOut: true,
      trialEndsAt: true,
      memberships: {
        where: { isOwner: true, isActive: true },
        select: { profile: { select: { ownerName: true, email: true } } },
        take: 1,
      },
      lifecycleEvents: { select: { key: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(({ memberships, lifecycleEvents, ...org }) => ({
    ...org,
    owner: memberships[0]?.profile ?? null,
    events: lifecycleEvents.map((e) => e.key),
  }));
}

/** Every live company — for the milestone catch-up pass. */
export async function listOrgIdsForMilestones(): Promise<string[]> {
  const rows = await db.organization.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "PAST_DUE", "LOCKED"] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function setMarketingOptOut(organizationId: string): Promise<boolean> {
  const res = await db.organization.updateMany({
    where: { id: organizationId },
    data: { marketingEmailsOptOut: true },
  });
  return res.count === 1;
}

export async function forgetLifecycleEmail(organizationId: string, key: LifecycleEmail): Promise<void> {
  await db.orgLifecycleEvent.deleteMany({ where: { organizationId, key: `email:${key}` } });
}
