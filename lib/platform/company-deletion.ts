import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENANT_MODELS } from "@/lib/tenant-models";
import { cancelSubscription } from "@/lib/billing/razorpay";
import { deleteOwnAccount } from "./account-deletion";

// SY35 — owner-requested company deletion.
//
//   request  → status DELETING (read-only, like LOCKED), purge scheduled
//              30 days out, Razorpay subscription cancelled now.
//   day 25   → reminder email (cron).
//   cancel   → any time before the purge; previous status restored.
//   day 30   → purge (cron): every row with this organizationId and every
//              storage object under <organizationId>/ is deleted. People
//              left with no company have their accounts deleted too.
//              The Organization row stays as an anonymised DELETED
//              tombstone because Syncit's own GST invoices (BillingInvoice,
//              statutory retention) reference it.
//
// Cross-company by nature (cron + platform), so it lives in lib/platform.

export const DELETION_GRACE_DAYS = 30;
export const DELETION_REMINDER_DAYS_BEFORE = 5; // → day 25
const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets whose object paths start with <organizationId>/ (SY22 storage RLS). */
export const ORG_STORAGE_BUCKETS = ["order-documents", "payment-proofs", "company-logos"] as const;

/** Company-owned tables beyond TENANT_MODELS. BillingInvoice is
 *  deliberately absent (Syncit's own tax records). */
const EXTRA_PURGE_MODELS = ["membership", "tallyPairingCode", "tallyConnector", "billingEvent"];

// ── request / cancel ──────────────────────────────────────────────

export async function requestCompanyDeletion(organizationId: string, actorId: string, now = new Date()) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { status: true, billingExempt: true, razorpaySubscriptionId: true, subscriptionStatus: true },
  });
  if (org.status === "DELETING" || org.status === "DELETED") {
    throw new Error("This company is already being deleted.");
  }

  const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS);
  await db.organization.update({
    where: { id: organizationId },
    data: {
      statusBeforeDeletion: org.status,
      status: "DELETING",
      deletionRequestedAt: now,
      deletionRequestedById: actorId,
      deletionScheduledFor: scheduledFor,
      deletionReminderSentAt: null,
    },
  });

  // Stop charging a company that is going away. Best-effort: billing
  // webhooks ignore DELETING orgs either way.
  if (
    !org.billingExempt &&
    org.razorpaySubscriptionId &&
    !["cancelled", "completed"].includes(org.subscriptionStatus ?? "")
  ) {
    await cancelSubscription(org.razorpaySubscriptionId, false).catch(() => undefined);
  }
  return { scheduledFor };
}

export async function cancelCompanyDeletion(organizationId: string) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { status: true, statusBeforeDeletion: true },
  });
  if (org.status !== "DELETING") throw new Error("This company is not scheduled for deletion.");
  const previous = org.statusBeforeDeletion;
  const restore: "ACTIVE" | "PAST_DUE" | "LOCKED" =
    previous === "PAST_DUE" || previous === "LOCKED" ? previous : "ACTIVE";
  await db.organization.update({
    where: { id: organizationId },
    data: {
      status: restore,
      statusBeforeDeletion: null,
      deletionRequestedAt: null,
      deletionRequestedById: null,
      deletionScheduledFor: null,
      deletionReminderSentAt: null,
    },
  });
}

// ── cron: reminders + purge ───────────────────────────────────────

const OWNER_CONTACT = {
  memberships: {
    where: { isOwner: true },
    select: { profile: { select: { email: true, ownerName: true } } },
    take: 1,
  },
} as const;

/** DELETING companies within 5 days of their purge that haven't been reminded. Marks them reminded. */
export async function takeDeletionReminders(now = new Date()) {
  const due = await db.organization.findMany({
    where: {
      status: "DELETING",
      deletionReminderSentAt: null,
      deletionScheduledFor: { lte: new Date(now.getTime() + DELETION_REMINDER_DAYS_BEFORE * DAY_MS) },
    },
    select: { id: true, name: true, deletionScheduledFor: true, ...OWNER_CONTACT },
  });
  for (const org of due) {
    await db.organization.update({ where: { id: org.id }, data: { deletionReminderSentAt: now } });
  }
  return due;
}

export async function companiesDueForPurge(now = new Date()) {
  return db.organization.findMany({
    where: { status: "DELETING", deletionScheduledFor: { lte: now } },
    select: { id: true },
  });
}

/**
 * Child-before-parent order for deleting a set of models, from Prisma's
 * relation metadata: if A holds a foreign key to B, A is deleted first.
 */
export function purgeOrder(modelKeys: string[]): string[] {
  const byName = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
  const toName = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  const toKey = (n: string) => n.charAt(0).toLowerCase() + n.slice(1);
  const names = new Set(modelKeys.map(toName));

  // parentsOf[A] = models A points at (must be deleted AFTER A)
  const parentsOf = new Map<string, Set<string>>();
  for (const name of Array.from(names)) {
    const parents = new Set<string>();
    for (const f of byName.get(name)?.fields ?? []) {
      if (f.kind === "object" && f.relationFromFields?.length && names.has(f.type) && f.type !== name) {
        parents.add(f.type);
      }
    }
    parentsOf.set(name, parents);
  }
  // Delete a model once nothing remaining still points at it.
  const remaining = new Set(names);
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = Array.from(remaining).filter(
      (n) => !Array.from(remaining).some((other) => other !== n && parentsOf.get(other)!.has(n)),
    );
    if (ready.length === 0) throw new Error(`purgeOrder: FK cycle among ${Array.from(remaining).join(", ")}`);
    for (const n of ready.sort()) {
      order.push(toKey(n));
      remaining.delete(n);
    }
  }
  return order;
}

async function listOrgObjects(bucket: string, prefix: string): Promise<string[]> {
  const storage = createAdminClient().storage.from(bucket);
  const files: string[] = [];
  const folders = [prefix];
  while (folders.length > 0) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(folder, { limit: 1000, offset });
      if (error) throw new Error(`storage list ${bucket}/${folder}: ${error.message}`);
      for (const item of data ?? []) {
        const path = `${folder}/${item.name}`;
        if (item.id) files.push(path);
        else folders.push(path); // folders have no id
      }
      if (!data || data.length < 1000) break;
    }
  }
  return files;
}

async function purgeStorage(organizationId: string): Promise<number> {
  let removed = 0;
  for (const bucket of ORG_STORAGE_BUCKETS) {
    const files = await listOrgObjects(bucket, organizationId);
    for (let i = 0; i < files.length; i += 1000) {
      const batch = files.slice(i, i + 1000);
      const { error } = await createAdminClient().storage.from(bucket).remove(batch);
      if (error) throw new Error(`storage remove ${bucket}: ${error.message}`);
      removed += batch.length;
    }
  }
  return removed;
}

/** Permanently erase a DELETING company's data. Idempotent: safe to re-run after a partial failure. */
export async function purgeCompany(organizationId: string, now = new Date()) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { status: true },
  });
  if (org.status !== "DELETING") throw new Error("purgeCompany: company is not DELETING");

  // People who will have no company left once this one is gone.
  const members = await db.membership.findMany({
    where: { organizationId },
    select: { profileId: true },
  });

  const storageObjects = await purgeStorage(organizationId);

  const counts: Record<string, number> = {};
  for (const model of purgeOrder([...TENANT_MODELS, ...EXTRA_PURGE_MODELS])) {
    const { count } = await db.$transaction(async (tx) => {
      // DELETING is read-only for the guard trigger; this purge is the
      // one sanctioned writer.
      await tx.$executeRaw`SELECT set_config('syncit.lock_bypass', 'on', true)`;
      const delegate = (tx as unknown as Record<string, { deleteMany: (a: unknown) => Promise<{ count: number }> }>)[model]!;
      return delegate.deleteMany({ where: { organizationId } });
    });
    counts[model] = count;
  }

  let accountsDeleted = 0;
  for (const { profileId } of members) {
    const stillMember = await db.membership.count({ where: { profileId } });
    if (stillMember > 0) continue;
    const res = await deleteOwnAccount(profileId).catch(() => null);
    if (res?.ok) accountsDeleted++;
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      status: "DELETED",
      deletedAt: now,
      name: "Deleted company",
      slug: `deleted-${organizationId.slice(0, 8)}`,
      gstin: null,
      city: null,
      state: null,
      industry: null,
      logoUrl: null,
      trialEndsAt: null,
    },
  });

  return { storageObjects, rows: counts, accountsDeleted };
}
