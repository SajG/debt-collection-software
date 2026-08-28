"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Role, UserAuditAction } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
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
  actorId: string,
  targetProfileId: string,
  action: UserAuditAction,
  detail: string | null,
): Promise<void> {
  await db.userAuditLog.create({
    data: { actorId, targetProfileId, action, detail },
  });
}

async function countActiveAdmins(): Promise<number> {
  return db.profile.count({ where: { role: "ADMIN", isActive: true } });
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
  const admin = await requireAdmin();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { ownerName, businessName, phone, email, role } = parsed.data;

  // Rule out obvious collisions before touching Supabase Auth so the
  // rollback path is rarer.
  const dupePhone = await db.profile.findFirst({ where: { phone } });
  if (dupePhone) return { error: `A user with phone ${phone} already exists.` };
  const dupeEmail = await db.profile.findFirst({ where: { email } });
  if (dupeEmail) return { error: `A user with email ${email} already exists.` };

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
  const admin = await requireAdmin();

  if (input.profileId === admin.id) {
    return { error: "You can't deactivate your own account." };
  }

  const target = await db.profile.findUnique({
    where: { id: input.profileId },
    select: { id: true, role: true, isActive: true, ownerName: true },
  });
  if (!target) return { error: "User not found." };
  if (!target.isActive) return { error: "User is already deactivated." };

  if (target.role === "ADMIN") {
    const others = await db.profile.count({
      where: {
        role: "ADMIN",
        isActive: true,
        id: { not: target.id },
      },
    });
    if (others === 0) {
      return {
        error:
          "Refusing to deactivate the last active ADMIN. Promote someone else first.",
      };
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: target.id },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedById: admin.id,
        },
      });
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
  const admin = await requireAdmin();

  const target = await db.profile.findUnique({
    where: { id: input.profileId },
    select: { id: true, isActive: true },
  });
  if (!target) return { error: "User not found." };
  if (target.isActive) return { error: "User is already active." };

  await db.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: target.id },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedById: null,
      },
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
  await requireAdmin();
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
  const admin = await requireAdmin();
  const parsed = roleEnum.safeParse(input.role);
  if (!parsed.success) return { error: "Invalid role." };

  const target = await db.profile.findUnique({
    where: { id: input.profileId },
    select: { id: true, role: true, isActive: true },
  });
  if (!target) return { error: "User not found." };
  if (target.role === input.role) {
    return { error: "That user already has this role." };
  }

  if (target.role === "ADMIN" && input.role !== "ADMIN" && target.isActive) {
    const others = await db.profile.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (others === 0) {
      return {
        error:
          "Refusing to demote the last active ADMIN. Promote someone else first.",
      };
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: target.id },
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
  const admin = await requireAdmin();

  const target = await db.profile.findUnique({
    where: { id: input.profileId },
    select: {
      id: true,
      email: true,
      ownerName: true,
      role: true,
      isActive: true,
    },
  });
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
  const admin = await requireAdmin();

  const target = await db.profile.findUnique({
    where: { id: input.profileId },
    select: {
      id: true,
      email: true,
      ownerName: true,
      role: true,
      isActive: true,
    },
  });
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
