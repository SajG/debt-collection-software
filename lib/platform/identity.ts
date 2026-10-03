import { db } from "@/lib/db";

// SY32 — identity questions that are global by nature (a person's
// email / phone / auth account is shared across every company they
// belong to). Kept in lib/platform because answering them means
// looking outside the caller's company. Each returns only a count or
// a boolean — never another company's rows.

/** Active memberships this person holds in companies OTHER than
 *  `organizationId`. */
export async function countOtherActiveMemberships(
  organizationId: string,
  profileId: string,
): Promise<number> {
  return db.membership.count({
    where: { profileId, isActive: true, organizationId: { not: organizationId } },
  });
}

/** Whether any Profile (in any company) already uses this phone/email. */
export async function identityInUse(params: {
  phone?: string;
  email?: string;
  excludeProfileId?: string;
}): Promise<{ phone: boolean; email: boolean }> {
  const notSelf = params.excludeProfileId
    ? { id: { not: params.excludeProfileId } }
    : {};
  const [phone, email] = await Promise.all([
    params.phone
      ? db.profile.count({ where: { phone: params.phone, ...notSelf } })
      : 0,
    params.email
      ? db.profile.count({ where: { email: params.email, ...notSelf } })
      : 0,
  ]);
  return { phone: phone > 0, email: email > 0 };
}

/** The caller's OWN active memberships (company switcher / picker).
 *  Pass the signed-in user's id only. */
export async function listOwnMemberships(profileId: string) {
  const rows = await db.membership.findMany({
    where: { profileId, isActive: true },
    select: {
      organizationId: true,
      role: true,
      isOwner: true,
      organization: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}
