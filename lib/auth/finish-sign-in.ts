import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgRequiresManagement2fa } from "@/lib/authz";
import { pinActiveOrgClaim } from "@/lib/platform/active-org";
import { safePath } from "@/lib/safe-redirect";
import { currentAssuranceLevel, getMfaFactorState } from "@/lib/auth/mfa";

// SY42 — the one place that decides where a freshly authenticated web
// user goes. Used by the emailed-code path and the password path so both
// route identically:
//   * disabled account            → sign out, /account-disabled
//   * no active membership        → /onboarding
//   * FACTORY → /production, others → /dashboard (callbackUrl wins)
//   * ADMIN of a company that requires management 2FA → enrol / challenge
//
// Never returns: always redirects, or returns an error string when the
// session cannot be read.

export async function finishSignIn(
  supabase: SupabaseClient,
  callbackUrl?: string,
): Promise<{ error: string }> {
  cookies().set("syncit_auth_since", String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign-in did not complete. Please try again." };

  const admin = createAdminClient();
  const profile = await admin
    .from("Profile")
    .select("isActive")
    .eq("id", user.id)
    .maybeSingle();
  if (!(profile.data?.isActive ?? true)) {
    await supabase.auth.signOut();
    redirect("/account-disabled");
  }

  const { active } = await pinActiveOrgClaim(user);
  if (!active) redirect("/onboarding");

  const roleHome = active.role === "FACTORY" ? "/production" : "/dashboard";
  const safeCallback = safePath(callbackUrl, roleHome);

  if (active.role !== "ADMIN") redirect(safeCallback);
  if (process.env.AUTH_SKIP_MFA === "1") redirect(safeCallback);
  if (!(await orgRequiresManagement2fa(active.organizationId))) redirect(safeCallback);

  const factor = await getMfaFactorState(supabase);
  if (factor.kind !== "verified") redirect("/settings/security?first=1");

  if ((await currentAssuranceLevel(supabase)) === "aal2") redirect(safeCallback);

  redirect(`/login/challenge?${new URLSearchParams({ next: safeCallback }).toString()}`);
}
