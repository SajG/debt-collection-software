import type { Role } from "@prisma/client";
import type { User } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

// SY31 — called once at sign-in (web OAuth callback + emailed code).
//
// Keeps the session's `active_org_id` claim pointing at one of the
// user's OWN active memberships:
//   * a claim that still matches an active membership is kept, so the
//     last company they switched to survives a re-login;
//   * otherwise the claim is set to their first membership (owner
//     first, then oldest);
//   * no memberships → the claim is cleared and the caller sends them
//     to /onboarding.
// Never points at a company the user isn't a member of.

export async function pinActiveOrgClaim(user: User): Promise<{
  membershipCount: number;
  /** The pinned company and the caller's role in it; null when they
   *  have no active membership. */
  active: { organizationId: string; role: Role } | null;
}> {
  const memberships = await db.membership.findMany({
    where: { profileId: user.id, isActive: true },
    select: { organizationId: true, role: true },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });

  const current = (user.app_metadata as { active_org_id?: string } | null)
    ?.active_org_id;
  const keep =
    current && memberships.some((m) => m.organizationId === current);
  const next = keep ? current : memberships[0]?.organizationId ?? null;

  if (next !== (current ?? null)) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), active_org_id: next },
    });
  }
  const active = memberships.find((m) => m.organizationId === next) ?? null;
  return { membershipCount: memberships.length, active };
}
