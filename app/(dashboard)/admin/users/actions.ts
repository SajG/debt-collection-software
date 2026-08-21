"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Role, UserAuditAction } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true; profileId?: string } | { error: string };

const roleEnum = z.enum(["ADMIN", "STAFF", "FACTORY"]);

// Same rule the mobile phone-auth form uses: Indian 10-digit mobile.
const phoneRegex = /^[6-9]\d{9}$/;

const createSchema = z.object({
  ownerName: z.string().trim().min(2, "Enter the person's name").max(120),
  businessName: z
    .string()
    .trim()
    .min(2, "Enter the business name")
    .max(120)
    .default("SynWorks"),
  phone: z.string().trim().regex(phoneRegex, "Enter a 10-digit Indian mobile"),
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
  role: Role;
}): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { ownerName, businessName, phone, role } = parsed.data;

  // Rule out obvious collisions before touching Supabase Auth so the
  // rollback path is rarer.
  const dupe = await db.profile.findFirst({ where: { phone } });
  if (dupe) return { error: `A user with phone ${phone} already exists.` };

  const supabase = createAdminClient();
  const e164 = `+91${phone}`;
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      phone: e164,
      phone_confirm: true,
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
          role,
          createdById: admin.id,
        },
      });
      await tx.userAuditLog.create({
        data: {
          actorId: admin.id,
          targetProfileId: userId,
          action: "CREATED",
          detail: `role=${role} phone=+91${phone}`,
        },
      });
    });
  } catch (e) {
    // Roll back the auth user so the invariant "auth.users row implies
    // Profile row" stays true. Best-effort — if the delete fails, an
    // orphan auth row still can't sign in because AuthContext refuses
    // sessions without a Profile.
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return {
      error:
        e instanceof Error
          ? `Profile insert failed (auth rollback attempted): ${e.message}`
          : "Profile insert failed (auth rollback attempted).",
    };
  }

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
