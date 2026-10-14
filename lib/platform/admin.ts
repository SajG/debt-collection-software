import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentAssuranceLevel } from "@/lib/auth/mfa";

// SY40 — who may open /platform (the Syncit operator console).
//
// This is NOT a company role. It is a short list of Syncit staff email
// addresses in the PLATFORM_ADMINS environment variable (comma
// separated). Membership / requireMembership() play no part: the
// console shows operational facts about Syncit itself (cron runs),
// never a company's business data.
//
// Three gates, all required:
//   1. a signed-in Supabase session,
//   2. that session's email is listed in PLATFORM_ADMINS,
//   3. the session is aal2 (TOTP verified in this session).
// Anyone failing 1 or 2 gets a plain 404, so the console's existence is
// not advertised. A listed operator who has not passed TOTP yet is sent
// to do so. Empty or unset PLATFORM_ADMINS = nobody.

export function parsePlatformAdmins(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parsePlatformAdmins(raw).has(email.trim().toLowerCase());
}

export type PlatformAdmin = { id: string; email: string };

export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isPlatformAdminEmail(user.email, process.env.PLATFORM_ADMINS)) notFound();

  const aal = await currentAssuranceLevel(supabase);
  if (aal !== "aal2") {
    const { data } = await supabase.auth.mfa.listFactors();
    const hasVerifiedTotp = (data?.totp ?? []).some((f) => f.status === "verified");
    redirect(hasVerifiedTotp ? "/login/challenge" : "/settings/security");
  }
  return { id: user.id, email: user.email };
}
