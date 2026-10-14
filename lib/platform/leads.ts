import type { Attribution } from "@/lib/attribution";
import { db } from "@/lib/db";

// SY42 — sign-up lead persistence. Platform table, service-role /
// Prisma only; never exposed to a tenant.

export type LeadDetails = {
  ownerName: string;
  email: string;
  phone: string;
  designation?: string;
  companyName: string;
  gstin?: string;
  address?: string;
  city: string;
  state: string;
  pincode?: string;
  industry: string;
  teamSize?: string;
};

export async function createLead(params: {
  authMethod: "password" | "google";
  profileId: string;
  details: LeadDetails;
  attribution: Attribution;
  ip: string;
  userAgent: string | null;
}) {
  const { details: d, attribution: a } = params;
  // One open lead per auth user: a re-submit overwrites, not duplicates.
  const existing = await db.signupLead.findFirst({
    where: { profileId: params.profileId, status: "PENDING_VERIFY" },
    select: { id: true },
  });
  const data = {
    authMethod: params.authMethod,
    profileId: params.profileId,
    ownerName: d.ownerName,
    email: d.email,
    phone: d.phone,
    designation: d.designation ?? null,
    companyName: d.companyName,
    gstin: d.gstin ?? null,
    address: d.address ?? null,
    city: d.city,
    state: d.state,
    pincode: d.pincode ?? null,
    industry: d.industry,
    teamSize: d.teamSize ?? null,
    utmSource: a.utmSource ?? null,
    utmMedium: a.utmMedium ?? null,
    utmCampaign: a.utmCampaign ?? null,
    utmTerm: a.utmTerm ?? null,
    utmContent: a.utmContent ?? null,
    gclid: a.gclid ?? null,
    fbclid: a.fbclid ?? null,
    referrer: a.referrer ?? null,
    landingPath: a.landingPath ?? null,
    referralCode: a.referralCode ?? null,
    firstSeenAt: a.firstSeenAt ? new Date(a.firstSeenAt) : null,
    ip: params.ip,
    userAgent: params.userAgent?.slice(0, 300) ?? null,
  };
  if (existing) {
    return db.signupLead.update({ where: { id: existing.id }, data });
  }
  return db.signupLead.create({ data });
}

export async function findPendingLead(profileId: string) {
  return db.signupLead.findFirst({
    where: { profileId, status: "PENDING_VERIFY" },
    orderBy: { createdAt: "desc" },
  });
}

export async function completeLead(
  leadId: string,
  organizationId: string,
): Promise<void> {
  await db.signupLead.update({
    where: { id: leadId },
    data: { status: "COMPLETED", organizationId, completedAt: new Date() },
  });
}
