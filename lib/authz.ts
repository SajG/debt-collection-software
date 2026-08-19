import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Profile } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

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

/** For ADMIN-only pages & server actions. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");
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
  if (opts?.adminOnly && profile.role !== "ADMIN") {
    return {
      profile: null,
      failure: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }
  return { profile, failure: null };
}

