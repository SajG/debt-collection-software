import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Profile } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { readMfaStatus } from "@/lib/auth/mfa";

// The pure scope predicates live in lib/authz-scope.ts so vitest can
// import them without pulling in next/headers via the Supabase server
// client. Callers keep importing them from @/lib/authz.
export {
  partyScopeWhere,
  canAccessParty,
  canAccessOrder,
} from "./authz-scope";

/** Authenticated user's Profile row, or null. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return db.profile.findUnique({ where: { id: user.id } });
}

/** For pages & server actions: redirects to /login when unauthenticated,
 *  or to /account-disabled when the profile has been deactivated by an
 *  admin. Never returns an inactive Profile to callers. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.isActive) redirect("/account-disabled");
  return profile;
}

/** For ADMIN-only pages & server actions. Two additional gates on
 *  top of requireProfile:
 *   1. role must be ADMIN
 *   2. session assurance level must be aal2 — a password-only
 *      session is bounced to the TOTP challenge screen. An ADMIN who
 *      has not yet enrolled a factor is sent to /settings/security
 *      to finish setup; without a factor the challenge would be
 *      impossible.
 *
 *  The aal check happens inside requireAdmin (not requireProfile)
 *  because STAFF / FACTORY are not required to enrol MFA and would
 *  never satisfy aal2.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const { factor, aal } = await readMfaStatus();
  if (factor.kind !== "verified") {
    // No verified factor at all → force enrolment. The security page
    // is the only ADMIN destination allowed to render at aal1 with
    // no factor, so it also acts as the escape hatch for first-run
    // admins.
    redirect("/settings/security");
  }
  if (aal !== "aal2") {
    // Verified factor exists but the current session hasn't
    // challenged. Route to challenge; on success user comes back
    // here at aal2.
    redirect("/login/challenge");
  }
  return profile;
}

/** Factory console — ADMIN and FACTORY only; STAFF redirected away. */
export async function requireFactoryOrAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN" && profile.role !== "FACTORY") {
    redirect("/dashboard");
  }
  return profile;
}

type ApiAuthResult =
  | { profile: Profile; failure: null }
  | { profile: null; failure: NextResponse };

/** For API route handlers: returns a ready-to-return 401/403 instead of redirecting. */
export async function requireProfileApi(opts?: {
  adminOnly?: boolean;
}): Promise<ApiAuthResult> {
  const profile = await getProfile();
  if (!profile) {
    return {
      profile: null,
      failure: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
    };
  }
  if (!profile.isActive) {
    return {
      profile: null,
      failure: NextResponse.json({ error: "Account disabled" }, { status: 403 }),
    };
  }
  if (opts?.adminOnly) {
    if (profile.role !== "ADMIN") {
      return {
        profile: null,
        failure: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
      };
    }
    const { factor, aal } = await readMfaStatus();
    if (factor.kind !== "verified" || aal !== "aal2") {
      // Same behaviour as requireAdmin() but as JSON so callers can
      // handle it programmatically instead of a redirect.
      return {
        profile: null,
        failure: NextResponse.json(
          { error: "MFA required", code: "mfa_required" },
          { status: 401 },
        ),
      };
    }
  }
  return { profile, failure: null };
}

