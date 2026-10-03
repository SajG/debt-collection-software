import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Profile } from "@prisma/client";
import { readMfaStatus } from "@/lib/auth/mfa";
import {
  getActiveMembership,
  requireMembership,
  tenantDb,
  type MembershipContext,
} from "./tenant";

// The pure scope predicates live in lib/authz-scope.ts so vitest can
// import them without pulling in next/headers via the Supabase server
// client. Callers keep importing them from @/lib/authz.
export {
  partyScopeWhere,
  canAccessParty,
  canAccessOrder,
  canViewOrder,
  canActOnOrder,
} from "./authz-scope";

/** SY31 — the caller's Profile with `role` overwritten by the role on
 *  their ACTIVE Membership. Profile.role is never used for
 *  permissions; it is a stale per-user default from before
 *  multi-company. Keeping the Profile shape lets existing pages keep
 *  compiling while every role check reads the per-company role. */
export type AuthedProfile = Profile & {
  /** The caller's active company (from requireMembership()). */
  organizationId: string;
  isOwner: boolean;
};

function profileWithMembershipRole(ctx: MembershipContext): AuthedProfile {
  return {
    ...ctx.profile,
    role: ctx.role,
    organizationId: ctx.organizationId,
    isOwner: ctx.isOwner,
  };
}

/** BusinessSettings.requireManagement2fa for the given company. */
export async function orgRequiresManagement2fa(
  organizationId: string,
): Promise<boolean> {
  const settings = await tenantDb(organizationId).businessSettings.findUnique({
    where: { organizationId },
    select: { requireManagement2fa: true },
  });
  return settings?.requireManagement2fa === true;
}

/** For pages & server actions. Redirects to /login when signed out,
 *  /account-disabled when the Profile is deactivated, and /onboarding
 *  when the caller has no active Membership. The returned role is the
 *  active Membership's role. */
export async function requireProfile(): Promise<AuthedProfile> {
  const ctx = await requireMembership();
  return profileWithMembershipRole(ctx);
}

/** For ADMIN-only pages & server actions. Two additional gates on
 *  top of requireProfile:
 *   1. active Membership role must be ADMIN
 *   2. when the active company has requireManagement2fa on, session
 *      assurance level must be aal2 — a single-factor session is
 *      bounced to the TOTP challenge screen. An ADMIN who has not yet
 *      enrolled a factor is sent to /settings/security to finish
 *      setup; without a factor the challenge would be impossible.
 *
 *  The aal check happens inside requireAdmin (not requireProfile)
 *  because STAFF / FACTORY are not required to enrol MFA and would
 *  never satisfy aal2.
 */
export async function requireAdmin(): Promise<AuthedProfile> {
  const ctx = await requireMembership();
  const profile = profileWithMembershipRole(ctx);
  if (profile.role !== "ADMIN") redirect("/dashboard");

  // Pilot escape hatch — set AUTH_SKIP_MFA=1 to bypass the TOTP wall
  // globally. Kept for local dev only; production should use the
  // per-org toggle below instead.
  if (process.env.AUTH_SKIP_MFA === "1") return profile;

  // SY23 — MFA is per-org opt-in. A brand-new distributor signing
  // up should NOT hit a TOTP wall on their first login. Synergy's
  // BusinessSettings.requireManagement2fa is flipped true by the
  // 20260929050000_saas_onboarding migration; every new org starts
  // false and shows a "Protect your account" nudge instead.
  if (!(await orgRequiresManagement2fa(ctx.organizationId))) return profile;

  const { factor, aal } = await readMfaStatus();
  if (factor.kind !== "verified") {
    redirect("/settings/security");
  }
  if (aal !== "aal2") {
    redirect("/login/challenge");
  }
  return profile;
}

/** Factory console — ADMIN and FACTORY only; STAFF redirected away. */
export async function requireFactoryOrAdmin(): Promise<AuthedProfile> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN" && profile.role !== "FACTORY") {
    redirect("/dashboard");
  }
  return profile;
}

type ApiAuthResult =
  | { profile: AuthedProfile; organizationId: string; failure: null }
  | { profile: null; organizationId: null; failure: NextResponse };

function apiFailure(error: string, status: number, code?: string): ApiAuthResult {
  return {
    profile: null,
    organizationId: null,
    failure: NextResponse.json(code ? { error, code } : { error }, { status }),
  };
}

/** For API route handlers: returns a ready-to-return 401/403 instead of
 *  redirecting. `profile.role` is the active Membership's role. */
export async function requireProfileApi(opts?: {
  adminOnly?: boolean;
}): Promise<ApiAuthResult> {
  const result = await getActiveMembership();
  if (result.status === "signed-out" || result.status === "no-profile") {
    return apiFailure("Unauthorised", 401);
  }
  if (result.status === "disabled") {
    return apiFailure("Account disabled", 403);
  }
  if (result.status === "no-company") {
    return apiFailure("No active company", 403, "no_company");
  }
  const { ctx } = result;
  const profile = profileWithMembershipRole(ctx);
  const ok: ApiAuthResult = {
    profile,
    organizationId: ctx.organizationId,
    failure: null,
  };

  if (opts?.adminOnly) {
    if (profile.role !== "ADMIN") {
      return apiFailure("Admin access required", 403);
    }
    if (process.env.AUTH_SKIP_MFA === "1") return ok;
    // SY23 — mirror requireAdmin's per-org MFA opt-in for API routes.
    if (!(await orgRequiresManagement2fa(ctx.organizationId))) return ok;
    const { factor, aal } = await readMfaStatus();
    if (factor.kind !== "verified" || aal !== "aal2") {
      // Same behaviour as requireAdmin() but as JSON so callers can
      // handle it programmatically instead of a redirect.
      return apiFailure("MFA required", 401, "mfa_required");
    }
  }
  return ok;
}
