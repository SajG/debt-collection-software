import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

// SY35 — a person deletes their own Syncit account (Google Play / App
// Store account-deletion requirement).
//
// What goes:
//   * sign-in (the Supabase auth user — sessions, MFA factors, identities)
//   * name, phone and email on the Profile (replaced with "Former member")
//   * push tokens, enrolled devices, recovery codes
//   * access to every company (memberships deactivated)
// What stays, with the company that owns it:
//   * orders, payments, notes the person recorded — they are the
//     company's business records — now shown as "Former member".
//
// Identity-level, not company-scoped (it spans every company the person
// belongs to), so it lives in lib/platform with raw db.

export const FORMER_MEMBER_NAME = "Former member";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: "owner"; companies: string[] }
  | { ok: false; code: "not_found" };

/** Companies this person still owns (and that aren't already being deleted). */
export async function companiesBlockingDeletion(profileId: string): Promise<string[]> {
  const owned = await db.membership.findMany({
    where: {
      profileId,
      isOwner: true,
      isActive: true,
      organization: { status: { notIn: ["DELETING", "DELETED"] } },
    },
    select: { organization: { select: { name: true } } },
  });
  return owned.map((m) => m.organization.name);
}

export async function deleteOwnAccount(profileId: string): Promise<DeleteAccountResult> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: { id: true, deletedAt: true },
  });
  if (!profile) return { ok: false, code: "not_found" };

  // An owner must hand the company to someone else (or delete it) first,
  // otherwise the company is left with nobody who can manage billing.
  const companies = await companiesBlockingDeletion(profileId);
  if (companies.length > 0) return { ok: false, code: "owner", companies };

  if (!profile.deletedAt) {
    await db.$transaction(async (tx) => {
      // Profile.isActive follows via the sync_profile_from_membership trigger.
      await tx.membership.updateMany({
        where: { profileId, isActive: true },
        data: { isActive: false },
      });
      await tx.pushToken.deleteMany({ where: { profileId } });
      await tx.device.deleteMany({ where: { profileId } });
      await tx.recoveryCode.deleteMany({ where: { profileId } });
      await tx.profile.update({
        where: { id: profileId },
        data: {
          ownerName: FORMER_MEMBER_NAME,
          businessName: "",
          phone: null,
          email: null,
          costCentreName: null,
          deletedAt: new Date(),
          deactivatedAt: new Date(),
        },
      });
    });
  }

  // Last, so a failure here can simply be retried: the data above is
  // already gone and the call is idempotent.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error && !/not found/i.test(error.message)) throw new Error(error.message);
  return { ok: true };
}
