"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Role, UserAuditAction } from "@prisma/client";
import { tenantDb, type TenantClient } from "@/lib/tenant";
import { countOtherActiveMemberships, identityInUse } from "@/lib/platform/identity";
import { requireAdmin } from "@/lib/authz";
import { checkSeatAvailable } from "@/lib/platform/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSsrClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; profileId?: string } | { error: string };

export type RevokeDeviceResult = { ok: true } | { error: string };

export type InviteResult =
  | { ok: true; email: string; kind: "invited" | "magiclink" }
  | { error: string };

const roleEnum = z.enum(["ADMIN", "STAFF", "FACTORY"]);

// Same rule the mobile phone-auth form uses: Indian 10-digit mobile.
const phoneRegex = /^[6-9]\d{9}$/;

// Fake-domain blocklist. Every one of these has bitten us or is a
// documented placeholder: the old @synworks.local pattern, RFC-2606
// test/example TLDs, and "internal" which some enterprise IdPs use
// as a private domain we do NOT want authenticating end users.
// Enforced at three layers: this validator, a CHECK constraint on
// Profile.email (migration 20260828050000_profile_email), and the
// backfill script.
const FAKE_DOMAIN_RE = /\.(local|test|invalid|internal|localhost|example)$/i;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254)
  .refine(
    (v) => !FAKE_DOMAIN_RE.test(v),
    "Use a real deliverable email — not .local / .test / .invalid / .internal.",
  );

const createSchema = z.object({
  ownerName: z.string().trim().min(2, "Enter the person's name").max(120),
  businessName: z
    .string()
    .trim()
    .min(2, "Enter the business name")
    .max(120)
    .default("Syncit"),
  phone: z.string().trim().regex(phoneRegex, "Enter a 10-digit Indian mobile"),
  email: emailSchema,
  role: roleEnum,
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function writeAudit(
  db: TenantClient,
  actorId: string,
  targetProfileId: string,
  action: UserAuditAction,
  detail: string | null,
): Promise<void> {
  await db.userAuditLog.create({
    data: { actorId, targetProfileId, action, detail },
  });
}

// SY31 — every action below is scoped to the admin's ACTIVE company.
// A target must hold a Membership in that company; the role that
// matters is the Membership role (current_user_role() reads it too).

async function requireAdminInOrg() {
  const admin = await requireAdmin();
  const organizationId = admin.organizationId;
  return { admin, organizationId, db: tenantDb(organizationId) };
}

async function findTargetMembership(db: TenantClient, profileId: string) {
  return db.membership.findFirst({
    where: { profileId },
    select: { id: true, role: true, isActive: true },
  });
}

async function countActiveAdmins(
  db: TenantClient,
  excludeProfileId: string,
): Promise<number> {
  return db.membership.count({
    where: {
      role: "ADMIN",
      isActive: true,
      profileId: { not: excludeProfileId },
      profile: { isActive: true },
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Create user — auth first, then Profile. If Profile write fails,
// roll back the auth user rather than leaving an orphan that could
// log in with no profile row.
// ─────────────────────────────────────────────────────────────────

export async function createUserAction(input: {
  ownerName: string;
  businessName?: string;
  phone: string;
  email: string;
  role: Role;
}): Promise<ActionResult> {
  const { admin, organizationId, db } = await requireAdminInOrg();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { ownerName, businessName, phone, email, role } = parsed.data;

  // SY28 — plan seat limit. Checked before touching Supabase Auth.
  const seats = await checkSeatAvailable(organizationId);
  if (!seats.ok) return { error: seats.message };

  // Rule out obvious collisions before touching Supabase Auth so the
  // rollback path is rarer.
  const inUse = await identityInUse({ phone, email });
  if (inUse.phone) return { error: `A user with phone ${phone} already exists.` };
  if (inUse.email) return { error: `A user with email ${email} already exists.` };

  const supabase = createAdminClient();
  const e164 = `+91${phone}`;
  // Create the auth user with BOTH phone and email — phone stays the
  // identity anchor, email is the new sign-in channel. Don't confirm
  // the email yet; the invite link that follows will confirm it.
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      phone: e164,
      email,
      phone_confirm: true,
      email_confirm: false,
    });
  if (createErr || !created?.user) {
    return { error: createErr?.message ?? "Could not create auth user." };
  }
  const userId = created.user.id;

  try {
    await db.$transaction(async (tx) => {
      await tx.profile.create({
        data: {
          id: userId,
          businessName,
          ownerName,
          phone,
          email,
          role,
          createdById: admin.id,
        },
      });
      // SY22 — requireMembership() refuses users without an active
      // Membership, and SY28 counts seats from it.
      await tx.membership.create({
        data: {
          organizationId,
          profileId: userId,
          role,
          invitedById: admin.id,
        },
      });
      await tx.userAuditLog.create({
        data: {
          actorId: admin.id,
          targetProfileId: userId,
          action: "CREATED",
          detail: `role=${role} phone=+91${phone} email=${email}`,
        },
      });
    });
  } catch (e) {
    // Roll back the auth user so the invariant "auth.users row implies
    // Profile row" stays true.
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return {
      error:
        e instanceof Error
          ? `Profile insert failed (auth rollback attempted): ${e.message}`
          : "Profile insert failed (auth rollback attempted).",
    };
  }

  // Fire an invite email immediately so the workflow is one-and-done
  // for the admin. Best-effort — a mail failure here does not roll
  // back the user; the "Resend invite" button covers it.
  await inviteUserAction({ profileId: userId }).catch(() => undefined);

  revalidatePath("/admin/users");
  return { ok: true, profileId: userId };
}

// ─────────────────────────────────────────────────────────────────
// Deactivate — never deletes data. The BEFORE-UPDATE guard trigger
// refuses to leave the system without an active ADMIN, so we mirror
// that check here for a friendlier error.
// ─────────────────────────────────────────────────────────────────

export async function deactivateUserAction(input: {
  profileId: string;
}): Promise<ActionResult> {
  const { admin, organizationId, db } = await requireAdminInOrg();

  if (input.profileId === admin.id) {
    return { error: "You can't deactivate your own account." };
  }

  const membership = await findTargetMembership(db, input.profileId);
  if (!membership) return { error: "User not found." };
  if (!membership.isActive) return { error: "User is already deactivated." };
  const target = { id: input.profileId };

  if (membership.role === "ADMIN") {
    const others = await countActiveAdmins(db, target.id);
    if (others === 0) {
      return {
        error:
          "Refusing to deactivate the last active ADMIN. Promote someone else first.",
      };
    }
  }

  try {
    const otherOrgs = await countOtherActiveMemberships(organizationId, target.id);
    await db.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });
      // Profile.isActive is recomputed from memberships by the
      // sync_profile_from_membership trigger, so another company's
      // access is untouched. Stamp who/when only when this was their
      // last company.
      if (otherOrgs === 0) {
        await tx.profile.update({
          where: { id: target.id },
          data: { deactivatedAt: new Date(), deactivatedById: admin.id },
        });
      }
      await tx.userAuditLog.create({
        data: {
          actorId: admin.id,
          targetProfileId: target.id,
          action: "DEACTIVATED",
          detail: `by ${admin.ownerName}`,
        },
      });
    });
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Deactivation blocked: ${e.message}`
          : "Deactivation blocked.",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function reactivateUserAction(input: {
  profileId: string;
}): Promise<ActionResult> {
  const { admin, organizationId, db } = await requireAdminInOrg();

  const membership = await findTargetMembership(db, input.profileId);
  if (!membership) return { error: "User not found." };
  const target = await db.profile.findUnique({
    where: { id: input.profileId },
    select: { id: true, isActive: true },
  });
  if (!target) return { error: "User not found." };
  if (membership.isActive && target.isActive) {
    return { error: "User is already active." };
  }

  const seats = await checkSeatAvailable(organizationId);
  if (!seats.ok) return { error: seats.message };

  await db.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: membership.id },
      data: { isActive: true },
    });
    // isActive follows the membership via trigger.
    await tx.profile.update({
      where: { id: target.id },
      data: { deactivatedAt: null, deactivatedById: null },
    });
    await tx.userAuditLog.create({
      data: {
        actorId: admin.id,
        targetProfileId: target.id,
        action: "ACTIVATED",
        detail: `by ${admin.ownerName}`,
      },
    });
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Set / update a Profile's email — used by the inline "Add email"
// row action so an admin can fill in the missing address without
// deleting and recreating the user.
//
// Writes both the Profile row (so the app sees it) and the Supabase
// auth.users row (so the emailed-code login actually reaches this
// person). Fake-domain blocklist is enforced here too; a CHECK
// constraint on Profile.email + emailSchema.refine() are the belt
// and braces if a bad address slipped past the client.
// ─────────────────────────────────────────────────────────────────

const setEmailSchema = z.object({
  profileId: z.string().uuid(),
  email: emailSchema,
});

export async function setUserEmailAction(input: {
  profileId: string;
  email: string;
}): Promise<ActionResult> {
  const { admin, organizationId, db } = await requireAdminInOrg();
  const parsed = setEmailSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { profileId, email } = parsed.data;

  if (!(await findTargetMembership(db, profileId))) {
    return { error: "User not found." };
  }
  if ((await countOtherActiveMemberships(organizationId, profileId)) > 0) {
    return {
      error:
        "This person also belongs to another company, so their sign-in email can't be changed from here.",
    };
  }

  const target = await db.profile.findUnique({
    where: { id: profileId },
    select: { id: true, email: true, isActive: true },
  });
  if (!target) return { error: "User not found." };
  if (!target.isActive)
    return { error: "User is deactivated — reactivate before setting email." };
  if (target.email === email) return { ok: true, profileId };

  const dupe = (await identityInUse({ email, excludeProfileId: profileId })).email;
  if (dupe) return { error: `A different user already uses ${email}.` };

  const supabase = createAdminClient();
  // email_confirm:false — the invite email that follows will confirm.
  // If the admin never sends an invite, the address is still on file
  // and the next sign-in via OTP will confirm it on first verify.
  const { error: authErr } = await supabase.auth.admin.updateUserById(
    profileId,
    { email, email_confirm: false },
  );
  if (authErr) return { error: `Auth update failed: ${authErr.message}` };

  try {
    await db.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: profileId },
        data: { email },
      });
      await tx.userAuditLog.create({
        data: {
          actorId: admin.id,
          targetProfileId: profileId,
          action: "EMAIL_CHANGED",
          detail: target.email
            ? `${target.email} → ${email}`
            : `email set → ${email}`,
        },
      });
    });
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Profile update failed: ${e.message}`
          : "Profile update failed.",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true, profileId };
}

// Enrollment-code action removed (SY-email). The admin sign-in path
// for mobile is now: admin invites by email → user gets a 6-digit
// code by email → mobile signs in and registers the device via the
// register_device() RPC. See admin/users invite flow + mobile/app/
// (auth)/email.tsx.

// Revoke a specific device: sets Device.revokedAt and — because of
// the one-active-device-per-user simplification — kicks the user off
// all sessions globally so the revoked device's JWT loses access on
// its very next request.
export async function revokeDeviceAction(input: {
  deviceId: string;
}): Promise<RevokeDeviceResult> {
  const { db } = await requireAdminInOrg();
  // Split: the RPC needs the caller's auth.uid() (SSR client) to
  // enforce ADMIN + stamp the audit row; the global signOut needs
  // service_role. Two clients, one action.
  const ssr = createSsrClient();
  const admin = createAdminClient();

  const device = await db.device.findUnique({
    where: { id: input.deviceId },
    select: { id: true, profileId: true, revokedAt: true },
  });
  if (!device) return { error: "Device not found." };
  if (!(await findTargetMembership(db, device.profileId))) {
    return { error: "Device not found." };
  }
  if (device.revokedAt) {
    return { ok: true }; // idempotent
  }

  const { error: rpcErr } = await ssr.rpc("revoke_device", {
    p_device_id: input.deviceId,
  });
  if (rpcErr) return { error: rpcErr.message };

  // Kill any live JWT for the owner. See the migration header for
  // why revocation cascades to all sessions today.
  await admin.auth.admin
    .signOut(device.profileId, "global")
    .catch(() => undefined);

  revalidatePath("/admin/devices");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Role change. The guard trigger also blocks demoting the last active
// ADMIN; we mirror that for a friendlier error.
// ─────────────────────────────────────────────────────────────────

export async function changeRoleAction(input: {
  profileId: string;
  role: Role;
}): Promise<ActionResult> {
  const { admin, organizationId, db } = await requireAdminInOrg();
  const parsed = roleEnum.safeParse(input.role);
  if (!parsed.success) return { error: "Invalid role." };

  const membership = await findTargetMembership(db, input.profileId);
  if (!membership) return { error: "User not found." };
  const target = { id: input.profileId, role: membership.role };
  if (target.role === input.role) {
    return { error: "That user already has this role." };
  }

  if (target.role === "ADMIN" && input.role !== "ADMIN" && membership.isActive) {
    const others = await countActiveAdmins(db, target.id);
    if (others === 0) {
      return {
        error:
          "Refusing to demote the last active ADMIN. Promote someone else first.",
      };
    }
  }

  try {
    await db.$transaction(async (tx) => {
      // The Membership role is the one web + RLS enforce (SY31).
      // Profile.role follows via the sync_profile_from_membership
      // trigger (mobile still reads it).
      await tx.membership.update({
        where: { id: membership.id },
        data: { role: input.role },
      });
      await tx.userAuditLog.create({
        data: {
          actorId: admin.id,
          targetProfileId: target.id,
          action: "ROLE_CHANGED",
          detail: `${target.role} → ${input.role}`,
        },
      });
    });
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Role change blocked: ${e.message}`
          : "Role change blocked.",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Invite user by email (SY-email)
//
// Fires supabase.auth.admin.inviteUserByEmail. If the auth user
// already exists (common — createUserAction created it), invite
// fails; we fall back to admin.generateLink({type:'magiclink'}) so
// re-inviting is idempotent. Either way the user receives an email
// that lets them set a password or click through to sign in.
// ─────────────────────────────────────────────────────────────────

const RESEND_WINDOW_MS = 5 * 60 * 1000;

function appUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "";
  return raw.replace(/\/+$/, "");
}

async function sendInvite(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
  meta: { profileId: string; ownerName: string; role: Role },
): Promise<{ ok: true; kind: "invited" | "magiclink" } | { error: string }> {
  const base = appUrl();
  const redirectTo = base ? `${base}/auth/callback` : undefined;

  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    email,
    { data: meta, redirectTo },
  );
  if (!inviteErr) return { ok: true, kind: "invited" };

  const msg = inviteErr.message.toLowerCase();
  const alreadyExists =
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists");
  if (!alreadyExists) return { error: inviteErr.message };

  const { error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (linkErr) return { error: linkErr.message };
  return { ok: true, kind: "magiclink" };
}

export async function inviteUserAction(input: {
  profileId: string;
}): Promise<InviteResult> {
  const { admin, organizationId, db } = await requireAdminInOrg();

  const membership = await findTargetMembership(db, input.profileId);
  if (!membership?.isActive) return { error: "User not found." };
  const profileRow = await db.profile.findUnique({
    where: { id: input.profileId },
    select: {
      id: true,
      email: true,
      ownerName: true,
      isActive: true,
    },
  });
  const target = profileRow ? { ...profileRow, role: membership.role } : null;
  if (!target) return { error: "User not found." };
  if (!target.isActive)
    return { error: "User is deactivated — reactivate first." };
  if (!target.email)
    return { error: "This user has no email. Add one first." };

  const supabase = createAdminClient();
  const res = await sendInvite(supabase, target.email, {
    profileId: target.id,
    ownerName: target.ownerName,
    role: target.role,
  });
  if ("error" in res) return { error: res.error };

  await db.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: target.id },
      data: { invitedAt: new Date(), invitedById: admin.id },
    });
    await tx.userAuditLog.create({
      data: {
        actorId: admin.id,
        targetProfileId: target.id,
        action: "INVITED",
        detail: `${res.kind} → ${target.email}`,
      },
    });
  });

  revalidatePath("/admin/users");
  return { ok: true, email: target.email, kind: res.kind };
}

export async function resendInviteAction(input: {
  profileId: string;
}): Promise<InviteResult> {
  const { admin, organizationId, db } = await requireAdminInOrg();

  const membership = await findTargetMembership(db, input.profileId);
  if (!membership?.isActive) return { error: "User not found." };
  const profileRow = await db.profile.findUnique({
    where: { id: input.profileId },
    select: {
      id: true,
      email: true,
      ownerName: true,
      isActive: true,
    },
  });
  const target = profileRow ? { ...profileRow, role: membership.role } : null;
  if (!target) return { error: "User not found." };
  if (!target.isActive) return { error: "User is deactivated." };
  if (!target.email) return { error: "This user has no email." };

  // Rate limit — 5 min per profile. Read the last INVITED / INVITE_RESENT
  // event and refuse if inside the window.
  const recent = await db.userAuditLog.findFirst({
    where: {
      targetProfileId: target.id,
      action: { in: ["INVITED", "INVITE_RESENT"] },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_WINDOW_MS) {
    const waitS = Math.ceil(
      (RESEND_WINDOW_MS - (Date.now() - recent.createdAt.getTime())) / 1000,
    );
    return { error: `An invite went out recently. Try again in ${waitS} s.` };
  }

  const supabase = createAdminClient();
  const res = await sendInvite(supabase, target.email, {
    profileId: target.id,
    ownerName: target.ownerName,
    role: target.role,
  });
  if ("error" in res) return { error: res.error };

  await db.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: target.id },
      data: { invitedAt: new Date(), invitedById: admin.id },
    });
    await tx.userAuditLog.create({
      data: {
        actorId: admin.id,
        targetProfileId: target.id,
        action: "INVITE_RESENT",
        detail: `${res.kind} → ${target.email}`,
      },
    });
  });

  revalidatePath("/admin/users");
  return { ok: true, email: target.email, kind: res.kind };
}

// ─────────────────────────────────────────────────────────────────
// SY35 — transfer ownership. Only the current owner may hand the
// company to another ACTIVE ADMIN of the same company. The owner can
// then delete their own account (account deletion refuses owners).
// ─────────────────────────────────────────────────────────────────

export async function makeOwnerAction(input: {
  profileId: string;
}): Promise<ActionResult> {
  const { admin, db } = await requireAdminInOrg();
  if (!admin.isOwner) return { error: "Only the company owner can transfer ownership." };
  if (input.profileId === admin.id) return { error: "You are already the owner." };

  const target = await findTargetMembership(db, input.profileId);
  if (!target || !target.isActive) return { error: "User not found." };
  if (target.role !== "ADMIN") {
    return { error: "Make them an ADMIN first — only an admin can own the company." };
  }

  await db.$transaction(async (tx) => {
    await tx.membership.updateMany({
      where: { profileId: admin.id },
      data: { isOwner: false },
    });
    await tx.membership.update({
      where: { id: target.id },
      data: { isOwner: true },
    });
    await tx.userAuditLog.create({
      data: {
        actorId: admin.id,
        targetProfileId: input.profileId,
        action: "ROLE_CHANGED",
        detail: `ownership transferred by ${admin.ownerName}`,
      },
    });
  });

  revalidatePath("/admin/users");
  revalidatePath("/settings/billing");
  return { ok: true };
}
