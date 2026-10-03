import { Prisma, type Profile } from "@prisma/client";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TENANT_MODELS, type TenantModel } from "./tenant-models";

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
//                          /account-disabled when the profile is off,
//                          /onboarding when no company resolves.
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

export type ActiveMembershipResult =
  | { status: "ok"; ctx: MembershipContext }
  | { status: "signed-out" }
  | { status: "no-profile" }
  | { status: "disabled" }
  /** Signed in, but no active membership resolves for this session:
   *  either they belong to no company yet, or they belong to several
   *  and the session has no valid active_org_id claim. */
  | { status: "no-company"; membershipCount: number };

/**
 * Non-redirecting core of requireMembership(). Uses the JWT
 * app_metadata claim `active_org_id` when set (matches
 * current_org_id() in the DB); falls back to the sole active
 * membership when the user has exactly one. Never falls back to a
 * default company.
 */
export async function getActiveMembership(): Promise<ActiveMembershipResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "signed-out" };

  const profile = await db.profile.findUnique({ where: { id: user.id } });
  if (!profile) return { status: "no-profile" };
  if (!profile.isActive) return { status: "disabled" };

  const memberships = await db.membership.findMany({
    where: { profileId: user.id, isActive: true },
    select: { organizationId: true, role: true, isOwner: true },
  });

  const claimed = (user.app_metadata as { active_org_id?: string } | null)
    ?.active_org_id;

  const membership = claimed
    ? memberships.find((m) => m.organizationId === claimed)
    : memberships.length === 1
      ? memberships[0]
      : undefined;

  if (!membership) {
    return { status: "no-company", membershipCount: memberships.length };
  }

  return {
    status: "ok",
    ctx: {
      profile,
      organizationId: membership.organizationId,
      role: membership.role,
      isOwner: membership.isOwner,
    },
  };
}

/**
 * The caller's active membership, for pages & server actions.
 * Redirects to /login when signed out, /account-disabled when the
 * Profile is deactivated, and /onboarding when no company resolves.
 */
export async function requireMembership(): Promise<MembershipContext> {
  const result = await getActiveMembership();
  switch (result.status) {
    case "ok":
      return result.ctx;
    case "signed-out":
      redirect("/login");
    case "no-profile":
      await createClient().auth.signOut();
      redirect("/login");
    case "disabled":
      redirect("/account-disabled");
    case "no-company":
      redirect("/onboarding");
  }
}

// Models with an organizationId column that are NOT in TENANT_MODELS
// (TENANT_MODELS mirrors the SY21/SY22 SQL loops; these tables got
// their own policies later). tenantDb scopes them the same way.
const EXTRA_ORG_MODELS = [
  "membership",
  "tallyPairingCode",
  "tallyConnector",
  "billingInvoice",
  "billingEvent",
] as const;

const ORG_COLUMN_MODELS = new Set<string>([
  ...TENANT_MODELS,
  ...EXTRA_ORG_MODELS,
]);

type Where = Record<string, unknown>;

/** The where-fragment that restricts `modelKey` to one organization,
 *  or null for models tenantDb leaves untouched (LoginAttempt,
 *  SignupAttempt, RecoveryCode, BillingSequence — platform-only). */
function scopeFor(modelKey: string, organizationId: string): Where | null {
  if (ORG_COLUMN_MODELS.has(modelKey)) return { organizationId };
  switch (modelKey) {
    case "organization":
      return { id: organizationId };
    case "profile":
      return { memberships: { some: { organizationId } } };
    case "device":
    case "pushToken":
      return { profile: { memberships: { some: { organizationId } } } };
    default:
      return null;
  }
}

/** AND the scope onto an existing where. Never overwrites caller keys,
 *  so a unique selector ({ id }) stays at the top level as Prisma 5's
 *  extended-where-unique requires. */
function andScope(where: unknown, scope: Where): Where {
  const w = (where ?? {}) as Where;
  const existing = w.AND;
  const and = Array.isArray(existing) ? existing : existing ? [existing] : [];
  return { ...w, AND: [...and, scope] };
}

function modelKey(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

// Relation map from Prisma's DMMF: model → relation field → target
// model, plus the set of models that carry an organizationId column.
// Used to inject organizationId into NESTED creates, which the query
// extension would otherwise never see.
const RELATIONS = new Map<string, Map<string, string>>();
/** Relation fields on the FK-holding side (e.g. Invoice.party). Using
 *  one of these in create data means Prisma's "checked" input style,
 *  where the org must be given as organization: { connect }. */
const PARENT_RELATIONS = new Map<string, Set<string>>();
const ORG_MODEL_NAMES = new Set<string>();
for (const m of Prisma.dmmf.datamodel.models) {
  const rel = new Map<string, string>();
  const parents = new Set<string>();
  for (const f of m.fields) {
    if (f.kind === "object") {
      rel.set(f.name, f.type);
      if (f.relationFromFields && f.relationFromFields.length > 0) parents.add(f.name);
    }
    if (f.name === "organizationId") ORG_MODEL_NAMES.add(m.name);
  }
  RELATIONS.set(m.name, rel);
  PARENT_RELATIONS.set(m.name, parents);
}

type Data = Record<string, unknown>;

function isObj(v: unknown): v is Data {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function each(v: unknown, fn: (d: Data) => Data): unknown {
  if (Array.isArray(v)) return v.map((d) => (isObj(d) ? fn(d) : d));
  return isObj(v) ? fn(v) : v;
}

/** Walk nested relation writes in `data` (create / createMany /
 *  connectOrCreate / upsert / update payloads) and stamp the org on
 *  every row that will be CREATED in an org-scoped model. */
function walkNested(model: string, data: Data, organizationId: string): Data {
  const rel = RELATIONS.get(model);
  if (!rel) return data;
  const out: Data = { ...data };
  for (const [field, target] of Array.from(rel.entries())) {
    const op = out[field];
    if (!isObj(op) || field === "organization") continue;
    const next: Data = { ...op };
    if ("create" in next) {
      next.create = each(next.create, (d) => stampCreate(target, d, organizationId));
    }
    if (isObj(next.createMany) && "data" in next.createMany) {
      next.createMany = {
        ...next.createMany,
        data: each(next.createMany.data, (d) => stampCreate(target, d, organizationId, true)),
      };
    }
    if ("connectOrCreate" in next) {
      next.connectOrCreate = each(next.connectOrCreate, (c) => ({
        ...c,
        create: isObj(c.create) ? stampCreate(target, c.create, organizationId) : c.create,
      }));
    }
    if ("upsert" in next) {
      next.upsert = each(next.upsert, (u) => ({
        ...u,
        create: isObj(u.create) ? stampCreate(target, u.create, organizationId) : u.create,
        update: isObj(u.update) ? walkNested(target, u.update, organizationId) : u.update,
      }));
    }
    for (const k of ["update", "updateMany"] as const) {
      if (k in next) {
        next[k] = each(next[k], (u) =>
          isObj(u.data)
            ? { ...u, data: walkNested(target, u.data, organizationId) }
            : walkNested(target, u, organizationId),
        );
      }
    }
    out[field] = next;
  }
  return out;
}

/** Stamp organizationId on a row about to be created in `model`, in
 *  whichever input style the caller used, then recurse. */
function stampCreate(
  model: string,
  data: Data,
  organizationId: string,
  scalarOnly = false,
): Data {
  let row = data;
  if (ORG_MODEL_NAMES.has(model)) {
    const parents = PARENT_RELATIONS.get(model);
    const usesRelationStyle =
      !scalarOnly && Object.keys(row).some((k) => k !== "organization" && parents?.has(k));
    if ("organization" in row) {
      const connectId = (row.organization as { connect?: { id?: unknown } })?.connect?.id;
      if (connectId !== organizationId) throw crossOrg();
    } else if (row.organizationId !== undefined) {
      if (row.organizationId !== organizationId) throw crossOrg();
    } else if (usesRelationStyle) {
      row = { ...row, organization: { connect: { id: organizationId } } };
    } else {
      row = { ...row, organizationId };
    }
  }
  return scalarOnly ? row : walkNested(model, row, organizationId);
}

function crossOrg() {
  return new Prisma.PrismaClientKnownRequestError(
    "SY22: refuse to write across organizations",
    { code: "P2010", clientVersion: Prisma.prismaVersion.client },
  );
}

/**
 * Prisma client scoped to a single organization. Every operation on a
 * model with an organizationId column — reads, aggregates, updates,
 * deletes (including findUnique/update/delete by id) — gets
 * `organizationId = <org>` ANDed into its where-clause; creates and
 * upserts (top-level AND nested) get organizationId stamped and refuse
 * a different one. Profile is limited to members of the org,
 * Device/PushToken to their devices, Organization to the org's own row.
 *
 * Not covered (review by hand): $queryRaw / $executeRaw, and nested
 * `connect: { id }` to an existing row — the target row's org is not
 * checked (its own FK / RLS is the backstop).
 */
export function tenantDb(organizationId: string) {
  return db.$extends({
    name: "sy32-tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const key = modelKey(model);
          const scope = scopeFor(key, organizationId);
          const a = { ...((args ?? {}) as Record<string, unknown>) };

          if (scope && (WHERE_OPS.has(operation) || operation === "upsert")) {
            a.where = andScope(a.where, scope);
          }
          if (operation === "create") {
            a.data = stampCreate(model, a.data as Data, organizationId);
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            a.data = each(a.data, (d) => stampCreate(model, d, organizationId, true));
          } else if (operation === "upsert") {
            a.create = stampCreate(model, a.create as Data, organizationId);
            if (isObj(a.update)) a.update = walkNested(model, a.update, organizationId);
          } else if (
            (operation === "update" || operation === "updateMany") &&
            isObj(a.data)
          ) {
            if (
              ORG_MODEL_NAMES.has(model) &&
              a.data.organizationId !== undefined &&
              a.data.organizationId !== organizationId
            ) {
              throw crossOrg();
            }
            a.data = walkNested(model, a.data, organizationId);
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
/** The `tx` inside tenantDb(...).$transaction(async (tx) => …). */
export type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
/** Helpers that work inside or outside a transaction. */
export type TenantClient = TenantDb | TenantTx;

