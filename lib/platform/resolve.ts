import type { User } from "@supabase/supabase-js";
import { db } from "@/lib/db";

// SY32 — machine-context company resolution.
//
// Webhooks, signed public links and the Tally connector arrive with no
// signed-in user. They carry an external id (a Razorpay link id, a
// WhatsApp phone-number id, a signed order id) and need to know which
// company it belongs to BEFORE they can open tenantDb(orgId). Each
// helper here answers only that question — it returns ids, never
// another company's business rows. All further reads/writes go
// through tenantDb(orgId).

/** Company + row id for a Razorpay payment-link id. */
export async function findPaymentLinkOrg(
  providerLinkId: string,
): Promise<{ linkId: string; organizationId: string } | null> {
  const link = await db.paymentLink.findFirst({
    where: { providerLinkId },
    select: { id: true, organizationId: true },
  });
  if (!link?.organizationId) return null;
  return { linkId: link.id, organizationId: link.organizationId };
}

/** Company that owns a WhatsApp Business phone-number id. */
export async function findOrgByWhatsAppNumber(
  phoneNumberId: string,
): Promise<string | null> {
  const row = await db.businessSettings.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId },
    select: { organizationId: true },
  });
  return row?.organizationId ?? null;
}

/** Company of an order named in a signed customer status link. */
export async function findOrderOrg(orderId: string): Promise<string | null> {
  const row = await db.salesOrder.findUnique({
    where: { id: orderId },
    select: { organizationId: true },
  });
  return row?.organizationId ?? null;
}

/** First sign-in (OAuth): make sure a Profile row exists. Role STAFF,
 *  the lowest — the real role is the Membership's (SY31). */
export async function ensureStubProfile(user: User): Promise<void> {
  const existing = await db.profile.findUnique({
    where: { id: user.id },
    select: { id: true },
  });
  if (existing) return;
  const displayName =
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "Owner";
  await db.profile.create({
    data: {
      id: user.id,
      businessName: "",
      ownerName: displayName,
      email: user.email ?? null,
      role: "STAFF",
      isActive: true,
    },
  });
}

/** The caller's own active membership in `organizationId`, if any. */
export async function findOwnActiveMembership(
  profileId: string,
  organizationId: string,
): Promise<{ id: string; role: "ADMIN" | "STAFF" | "FACTORY" } | null> {
  return db.membership.findFirst({
    where: { organizationId, profileId, isActive: true },
    select: { id: true, role: true },
  });
}

/** Tally pairing code by its hash (connector pairing, no session). */
export async function findTallyPairingCode(codeHash: string) {
  return db.tallyPairingCode.findUnique({
    where: { codeHash },
    select: { id: true, organizationId: true, consumedAt: true, expiresAt: true },
  });
}

/** Tally connector by its token hash (connector sync, no session). */
export async function findTallyConnectorByTokenHash(tokenHash: string) {
  return db.tallyConnector.findUnique({
    where: { tokenHash },
    select: { id: true, organizationId: true, revokedAt: true },
  });
}
