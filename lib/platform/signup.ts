import { db } from "@/lib/db";

// SY32 — self-serve signup persistence. Org-agnostic by nature: the
// company doesn't exist yet, and the rate-limit table is keyed by IP /
// email domain, not company.

export async function countRecentSignupAttempts(
  ip: string,
  emailDomain: string,
  since: Date,
): Promise<{ ip: number; domain: number }> {
  const [ipCount, domainCount] = await Promise.all([
    db.signupAttempt.count({ where: { ip, createdAt: { gte: since } } }),
    db.signupAttempt.count({ where: { emailDomain, createdAt: { gte: since } } }),
  ]);
  return { ip: ipCount, domain: domainCount };
}

export async function recordSignupAttempt(ip: string, emailDomain: string): Promise<void> {
  await db.signupAttempt.create({ data: { ip, emailDomain, successful: false } });
}

export async function markSignupAttemptsSuccessful(
  ip: string,
  emailDomain: string,
): Promise<void> {
  await db.signupAttempt
    .updateMany({
      where: { emailDomain, ip, successful: false },
      data: { successful: true },
    })
    .catch(() => undefined);
}

export async function profileExistsForEmail(email: string): Promise<boolean> {
  const row = await db.profile.findUnique({ where: { email }, select: { id: true } });
  return row !== null;
}

/** Profile (if new) + Organization + owner Membership (ADMIN) +
 *  BusinessSettings in one transaction, so a failure never leaves a
 *  half-built company. */
export async function provisionCompany(params: {
  userId: string;
  companyName: string;
  ownerName: string;
  phone: string;
  email: string;
  slug: string;
  trialEndsAt: Date;
  /** SY42 — company details captured on the sign-up form. */
  company?: {
    gstin?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    industry?: string | null;
    teamSize?: string | null;
    signupSource?: string | null;
  };
}): Promise<{ id: string }> {
  const { userId, companyName, ownerName, phone, email, slug, trialEndsAt, company } = params;
  const existing = await db.profile.findUnique({ where: { id: userId }, select: { id: true } });
  return db.$transaction(async (tx) => {
    if (existing) {
      // Google users arrive with a stub profile (no name / phone).
      await tx.profile.update({
        where: { id: userId },
        data: { businessName: companyName, ownerName, phone },
      });
    } else {
      await tx.profile.create({
        data: {
          id: userId,
          businessName: companyName,
          ownerName,
          phone,
          email,
          // SY31 — lowest role. The real role is the Membership's
          // (ADMIN + isOwner, created below).
          role: "STAFF",
          isActive: true,
        },
      });
    }
    const created = await tx.organization.create({
      data: {
        name: companyName,
        slug,
        plan: "TRIAL",
        trialEndsAt,
        status: "ACTIVE",
        gstin: company?.gstin ?? null,
        address: company?.address ?? null,
        city: company?.city ?? null,
        state: company?.state ?? null,
        pincode: company?.pincode ?? null,
        industry: company?.industry ?? null,
        teamSize: company?.teamSize ?? null,
        signupSource: company?.signupSource ?? null,
      },
      select: { id: true },
    });
    await tx.membership.create({
      data: {
        organizationId: created.id,
        profileId: userId,
        role: "ADMIN",
        isOwner: true,
        isActive: true,
      },
    });
    await tx.businessSettings.create({
      data: {
        organizationId: created.id,
        onboardingDone: false,
        onboardingStep: "company",
        requireManagement2fa: false,
      },
    });
    return created;
  });
}
