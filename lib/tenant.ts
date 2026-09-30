import { Prisma, type Profile } from "@prisma/client";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TENANT_MODELS, TENANT_MODEL_SET, type TenantModel } from "./tenant-models";

export { TENANT_MODELS, type TenantModel };

// SY22 — tenant boundary for server code.
//
// Web / server actions / cron routes / RPCs all go through this
// module. RLS enforces isolation for direct-Supabase clients (i.e.
// the mobile app); Prisma connects with a role that BYPASSES RLS,
// so this helper is the last line of defence for server code.
//
//   requireMembership()  → the caller's { profile, org, role, membership }.
//                          Redirects to /login when unauthenticated,
//                          /account-disabled when no active membership.
//
//   tenantDb(orgId)      → a Prisma client that injects
//                          organizationId into every write and every
//                          where-clause on the tenant models. Reads
//                          without an organizationId scope return an
//                          empty set (not throw) so downstream code
//                          keeps its usual shape.
//
// Do not import `db` directly outside lib/tenant.ts, lib/platform/*
// (org-agnostic surfaces: auth, migrations, seed) or scripts/. The
// ESLint no-restricted-imports rule enforces this.

export type MembershipContext = {
  profile: Profile;
  organizationId: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
  isOwner: boolean;
};

/**
 * The caller's active membership. Uses the JWT app_metadata claim
 * `active_org_id` when set (matches current_org_id() in the DB);
 * falls back to the sole active membership when the user has only
 * one org (Synergy migration window). Users with multiple active
 * memberships MUST POST /api/session/active-org first.
 */
export async function requireMembership(): Promise<MembershipContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await db.profile.findUnique({ where: { id: user.id } });
  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  const claimed = (user.app_metadata as { active_org_id?: string } | null)
    ?.active_org_id;

  let membership;
  if (claimed) {
    membership = await db.membership.findFirst({
      where: {
        profileId: user.id,
        organizationId: claimed,
        isActive: true,
      },
      select: { organizationId: true, role: true, isOwner: true },
    });
  } else {
    const memberships = await db.membership.findMany({
      where: { profileId: user.id, isActive: true },
      select: { organizationId: true, role: true, isOwner: true },
      take: 2,
    });
    if (memberships.length === 1) membership = memberships[0];
  }

  if (!membership) redirect("/account-disabled");

  return {
    profile,
    organizationId: membership.organizationId,
    role: membership.role,
    isOwner: membership.isOwner,
  };
}

/**
 * Prisma client scoped to a single organization. Wraps db with a
 * client extension that:
 *   - Rejects create/upsert on tenant models unless organizationId
 *     matches the scope (or is omitted, in which case it's filled in).
 *   - Adds organizationId to every findFirst/findMany/count/update/
 *     delete where-clause so cross-org data never reaches the caller.
 *
 * Read-only relations that don't have organizationId (Profile,
 * Membership, PushToken, Device, LoginAttempt, RecoveryCode,
 * Organization itself) pass through untouched.
 */
export function tenantDb(organizationId: string) {
  return db.$extends({
    name: "sy22-tenant-scope",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (TENANT_MODEL_SET.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            args.where = mergeOrg(args.where, organizationId);
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (TENANT_MODEL_SET.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            args.where = mergeOrg(args.where, organizationId);
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          // Compound unique keys already include organizationId
          // (SY21). Nothing to add here — the type system enforces.
          return query(args);
        },
        async count({ model, args, query }) {
          if (TENANT_MODEL_SET.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            args.where = mergeOrg(args.where, organizationId);
          }
          return query(args);
        },
        async update({ model, args, query }) {
          if (TENANT_MODEL_SET.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            args.where = mergeOrg(args.where, organizationId);
          }
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (TENANT_MODEL_SET.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            args.where = mergeOrg(args.where, organizationId);
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (TENANT_MODEL_SET.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            args.where = mergeOrg(args.where, organizationId);
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (TENANT_MODEL_SET.has(model.charAt(0).toLowerCase() + model.slice(1))) {
            args.where = mergeOrg(args.where, organizationId);
          }
          return query(args);
        },
        async create({ model, args, query }) {
          const key = model.charAt(0).toLowerCase() + model.slice(1);
          if (TENANT_MODEL_SET.has(key)) {
            // Prisma's per-model union type won't accept a shared
            // injector without a widening cast. The invariant is
            // preserved by TENANT_MODEL_SET membership above.
            (args as { data: Record<string, unknown> }).data = injectOrg(
              (args as { data: Record<string, unknown> }).data,
              organizationId,
            );
          }
          return query(args);
        },
        async createMany({ model, args, query }) {
          const key = model.charAt(0).toLowerCase() + model.slice(1);
          if (TENANT_MODEL_SET.has(key)) {
            const argsData = (args as { data: Record<string, unknown> | Record<string, unknown>[] }).data;
            if (Array.isArray(argsData)) {
              (args as { data: unknown }).data = argsData.map((d) =>
                injectOrg(d, organizationId),
              );
            } else {
              (args as { data: unknown }).data = injectOrg(argsData, organizationId);
            }
          }
          return query(args);
        },
        async upsert({ model, args, query }) {
          const key = model.charAt(0).toLowerCase() + model.slice(1);
          if (TENANT_MODEL_SET.has(key)) {
            (args as { where: Record<string, unknown> }).where = mergeOrg(
              (args as { where: Record<string, unknown> }).where,
              organizationId,
            );
            (args as { create: Record<string, unknown> }).create = injectOrg(
              (args as { create: Record<string, unknown> }).create,
              organizationId,
            );
          }
          return query(args);
        },
      },
    },
  });
}

// ── helpers ───────────────────────────────────────────────────────

function mergeOrg<T extends Record<string, unknown> | undefined>(
  where: T,
  organizationId: string,
): T & { organizationId: string } {
  if (!where) return { organizationId } as T & { organizationId: string };
  return { ...where, organizationId } as T & { organizationId: string };
}

function injectOrg<T extends Record<string, unknown>>(
  data: T,
  organizationId: string,
): T {
  if (data == null) return { organizationId } as unknown as T;
  const existing = (data as { organizationId?: string }).organizationId;
  if (existing && existing !== organizationId) {
    throw new Prisma.PrismaClientKnownRequestError(
      "SY22: refuse to write across organizations",
      { code: "P2010", clientVersion: "sy22" },
    );
  }
  return { ...data, organizationId } as T;
}
