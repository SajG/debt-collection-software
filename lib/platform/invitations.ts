import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/monitoring";
import { tenantDb } from "@/lib/tenant";
import { checkSeatAvailable } from "@/lib/platform/billing";
import {
  INVITE_RESEND_THROTTLE_MS,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  newInviteToken,
  type InviteState,
} from "@/lib/invite-token";

// SY42 — staff invitation lifecycle. Platform code: it reads across
// companies by token (the invitee has no session yet), so every query
// either names an organizationId or a token hash.

export type InviteError =
  | "already_member"
  | "not_found"
  | "throttled"
  | "not_pending"
  | "expired"
  | "revoked"
  | "accepted"
  | "seat_limit";

export type CreateResult =
  | { ok: true; id: string; token: string; email: string }
  | { ok: false; error: InviteError | "seat_limit"; message: string };

/** New invite, or a fresh link for an existing PENDING one. */
export async function createInvitation(params: {
  organizationId: string;
  invitedById: string;
  email: string;
  role: Role;
  ownerName?: string;
  phone?: string;
}): Promise<CreateResult> {
  const email = params.email.trim().toLowerCase();

  const member = await db.membership.findFirst({
    where: {
      organizationId: params.organizationId,
      isActive: true,
      profile: { email },
    },
    select: { id: true },
  });
  if (member) {
    return { ok: false, error: "already_member", message: `${email} is already on your team.` };
  }

  const seats = await checkSeatAvailable(params.organizationId);
  if (!seats.ok) return { ok: false, error: "seat_limit", message: seats.message };

  const token = newInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = inviteExpiry();

  const pending = await db.invitation.findFirst({
    where: {
      organizationId: params.organizationId,
      status: "PENDING",
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (pending) {
    const updated = await db.invitation.update({
      where: { id: pending.id },
      data: {
        tokenHash,
        expiresAt,
        role: params.role,
        ownerName: params.ownerName ?? undefined,
        phone: params.phone ?? undefined,
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
      },
      select: { id: true },
    });
    return { ok: true, id: updated.id, token, email };
  }

  const created = await db.invitation.create({
    data: {
      organizationId: params.organizationId,
      email,
      role: params.role,
      ownerName: params.ownerName ?? null,
      phone: params.phone ?? null,
      tokenHash,
      invitedById: params.invitedById,
      expiresAt,
    },
    select: { id: true },
  });
  return { ok: true, id: created.id, token, email };
}

export type InvitationRow = {
  id: string;
  email: string;
  role: Role;
  ownerName: string | null;
  state: InviteState;
  expiresAt: Date;
  lastSentAt: Date;
  sendCount: number;
};

/** PENDING and lapsed invites for the Team page, newest first. */
export async function listInvitations(organizationId: string): Promise<InvitationRow[]> {
  const rows = await db.invitation.findMany({
    where: { organizationId, status: { in: ["PENDING", "EXPIRED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    ownerName: r.ownerName,
    state: inviteState(r),
    expiresAt: r.expiresAt,
    lastSentAt: r.lastSentAt,
    sendCount: r.sendCount,
  }));
}

export async function revokeInvitation(
  organizationId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: InviteError }> {
  const res = await db.invitation.updateMany({
    where: { id, organizationId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return res.count > 0 ? { ok: true } : { ok: false, error: "not_found" };
}

/** Rotate the token for a resend. Returns the new plaintext token. */
export async function rotateInvitation(
  organizationId: string,
  id: string,
): Promise<
  | { ok: true; token: string; email: string; role: Role; ownerName: string | null }
  | { ok: false; error: InviteError }
> {
  const inv = await db.invitation.findFirst({ where: { id, organizationId } });
  if (!inv || inv.status === "REVOKED" || inv.status === "ACCEPTED") {
    return { ok: false, error: "not_found" };
  }
  if (Date.now() - inv.lastSentAt.getTime() < INVITE_RESEND_THROTTLE_MS) {
    return { ok: false, error: "throttled" };
  }
  const seats = await checkSeatAvailable(organizationId);
  if (!seats.ok) return { ok: false, error: "seat_limit" };
  const token = newInviteToken();
  await db.invitation.update({
    where: { id },
    data: {
      tokenHash: hashInviteToken(token),
      status: "PENDING",
      expiresAt: inviteExpiry(),
      lastSentAt: new Date(),
      sendCount: { increment: 1 },
    },
  });
  return { ok: true, token, email: inv.email, role: inv.role, ownerName: inv.ownerName };
}

export type InvitePreview =
  | {
      ok: true;
      id: string;
      email: string;
      role: Role;
      ownerName: string | null;
      phone: string | null;
      organizationId: string;
      companyName: string;
      inviterName: string | null;
    }
  | { ok: false; error: "not_found" | "expired" | "revoked" | "accepted" };

export async function previewInvitation(token: string): Promise<InvitePreview> {
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { organization: { select: { name: true, status: true } } },
  });
  if (!inv) return { ok: false, error: "not_found" };
  const state = inviteState(inv);
  if (state !== "pending") return { ok: false, error: state };
  if (inv.organization.status === "DELETED" || inv.organization.status === "DELETING") {
    return { ok: false, error: "not_found" };
  }
  const inviter = await db.profile.findUnique({
    where: { id: inv.invitedById },
    select: { ownerName: true },
  });
  return {
    ok: true,
    id: inv.id,
    email: inv.email,
    role: inv.role,
    ownerName: inv.ownerName,
    phone: inv.phone,
    organizationId: inv.organizationId,
    companyName: inv.organization.name,
    inviterName: inviter?.ownerName ?? null,
  };
}

/** Join the company: Membership (new or re-activated), invite → ACCEPTED.
 *  The caller has already proven they own `inv.email`. */
export async function acceptInvitation(params: {
  invitationId: string;
  profileId: string;
}): Promise<{ ok: true; organizationId: string; role: Role } | { ok: false; error: InviteError; message?: string }> {
  const inv = await db.invitation.findUnique({ where: { id: params.invitationId } });
  if (!inv) return { ok: false, error: "not_found" };
  const state = inviteState(inv);
  if (state !== "pending") return { ok: false, error: state };

  const existing = await db.membership.findUnique({
    where: {
      organizationId_profileId: {
        organizationId: inv.organizationId,
        profileId: params.profileId,
      },
    },
    select: { id: true, isActive: true },
  });
  // A seat is only needed when this person is not already counted.
  if (!existing?.isActive) {
    const seats = await checkSeatAvailable(inv.organizationId);
    if (!seats.ok) return { ok: false, error: "seat_limit", message: seats.message };
  }

  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.membership.update({
        where: { id: existing.id },
        data: { isActive: true, role: inv.role },
      });
    } else {
      await tx.membership.create({
        data: {
          organizationId: inv.organizationId,
          profileId: params.profileId,
          role: inv.role,
          invitedById: inv.invitedById,
        },
      });
    }
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedProfileId: params.profileId },
    });
    await tx.profile.update({
      where: { id: params.profileId },
      data: { firstSignInAt: new Date() },
    });
  });

  await tenantDb(inv.organizationId).userAuditLog.create({
    data: {
      actorId: inv.invitedById,
      targetProfileId: params.profileId,
      action: "CREATED",
      detail: `role=${inv.role} via invitation`,
    },
  });
  return { ok: true, organizationId: inv.organizationId, role: inv.role };
}

/** Pending invites for an address — used to steer a new sign-in with
 *  no company toward "Join <Company>" instead of "Create company". */
export async function pendingInvitesForEmail(
  email: string,
): Promise<{ companyName: string; role: Role }[]> {
  const rows = await db.invitation.findMany({
    where: {
      email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    include: { organization: { select: { name: true } } },
    take: 5,
  });
  return rows.map((r) => ({ companyName: r.organization.name, role: r.role }));
}

/** Profile row for a brand-new invitee (auth user already created). */
export async function createInvitedProfile(params: {
  id: string;
  ownerName: string;
  phone: string | null;
  email: string;
  companyName: string;
  role: Role;
}): Promise<void> {
  await db.profile.create({
    data: {
      id: params.id,
      businessName: params.companyName,
      ownerName: params.ownerName,
      phone: params.phone,
      email: params.email,
      role: params.role,
      isActive: true,
      invitedAt: new Date(),
    },
  });
}

/** Roll back createInvitedProfile when joining fails part-way. */
export async function discardProfile(id: string): Promise<void> {
  await db.profile.delete({ where: { id } }).catch(() => undefined);
}

export type CreateAccountResult =
  | { ok: true; email: string; organizationId: string; role: Role }
  | {
      ok: false;
      error: "invalid" | "exists" | "weak" | "seat_limit" | "failed";
      message: string;
    };

const INVALID_MSG = "This invitation is no longer valid. Ask your manager to send a new one.";

/** New person, no account: create the (email-confirmed) auth user,
 *  Profile and Membership from a valid invite token. Shared by the web
 *  /join page and the mobile Join screen (POST /api/auth/invite). The
 *  caller signs the person in afterwards with the password it holds. */
export async function createAccountFromInvite(params: {
  token: string;
  ownerName: string;
  phone?: string;
  password: string;
}): Promise<CreateAccountResult> {
  const preview = await previewInvitation(params.token);
  if (!preview.ok) return { ok: false, error: "invalid", message: INVALID_MSG };
  const email = preview.email.toLowerCase();

  const existing = await db.profile.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      ok: false,
      error: "exists",
      message: "An account with this email already exists. Sign in to accept.",
    };
  }

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
    user_metadata: { name: params.ownerName },
  });
  if (createErr || !created?.user) {
    const m = createErr?.message ?? "";
    if (/password/i.test(m)) {
      return {
        ok: false,
        error: "weak",
        message: "That password is too weak or has appeared in a data breach. Choose another.",
      };
    }
    if (/already|registered|exists/i.test(m)) {
      return {
        ok: false,
        error: "exists",
        message: "An account with this email already exists. Sign in to accept.",
      };
    }
    await captureError(createErr ?? new Error("createUser returned no user"), {
      where: "createAccountFromInvite",
    });
    return { ok: false, error: "failed", message: "Could not create your account. Please try again." };
  }
  const userId = created.user.id;

  try {
    await createInvitedProfile({
      id: userId,
      ownerName: params.ownerName,
      phone: params.phone ?? preview.phone ?? null,
      email,
      companyName: preview.companyName,
      role: preview.role,
    });
    const res = await acceptInvitation({ invitationId: preview.id, profileId: userId });
    if (!res.ok) {
      await discardProfile(userId);
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      return res.error === "seat_limit"
        ? { ok: false, error: "seat_limit", message: res.message ?? "No seat is free." }
        : { ok: false, error: "invalid", message: INVALID_MSG };
    }
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...(created.user.app_metadata ?? {}), active_org_id: res.organizationId },
    });
    return { ok: true, email, organizationId: res.organizationId, role: res.role };
  } catch (e) {
    await discardProfile(userId);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    await captureError(e, { where: "createAccountFromInvite" });
    return { ok: false, error: "failed", message: "Could not complete joining. Please try again." };
  }
}
