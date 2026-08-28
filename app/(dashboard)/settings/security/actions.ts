"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/authz";
import {
  generateAndPersistRecoveryCodes,
  getMfaFactorState,
} from "@/lib/auth/mfa";

// Start-enrol: creates an unverified TOTP factor and returns the
// enrolment payload (issuer, secret, otpauth URI, QR SVG). The user
// scans it and calls verifyEnrolAction to finish.
export type StartEnrolResult =
  | {
      ok: true;
      factorId: string;
      qrCodeSvg: string;
      secret: string;
      otpauthUri: string;
    }
  | { error: string };

export async function startEnrolAction(): Promise<StartEnrolResult> {
  await requireProfile();
  const supabase = createClient();

  // Wipe any half-finished factor so retrying is clean.
  const existing = await getMfaFactorState(supabase);
  if (existing.kind === "unverified") {
    await supabase.auth.mfa.unenroll({ factorId: existing.factorId });
  }
  if (existing.kind === "verified") {
    return { error: "TOTP is already enabled on your account." };
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
  });
  if (error || !data) {
    return { error: error?.message ?? "Could not start enrolment." };
  }
  return {
    ok: true,
    factorId: data.id,
    qrCodeSvg: data.totp.qr_code,
    secret: data.totp.secret,
    otpauthUri: data.totp.uri,
  };
}

const verifySchema = z.object({
  factorId: z.string().min(1),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export type FinishEnrolResult =
  | { ok: true; recoveryCodes: string[] }
  | { error: string };

// Confirm-enrol: verifies the user's first code and, on success,
// generates + persists the recovery-code set. The plaintext codes
// are returned exactly once for the "print or copy now" screen.
export async function finishEnrolAction(input: {
  factorId: string;
  code: string;
}): Promise<FinishEnrolResult> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { factorId, code } = parsed.data;

  const supabase = createClient();
  const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (chalErr || !chal) {
    return { error: "Could not challenge the new factor. Try again." };
  }
  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: chal.id,
    code,
  });
  if (verifyErr) {
    return { error: "That code is not valid. Try again." };
  }

  const codes = await generateAndPersistRecoveryCodes(supabase);

  revalidatePath("/settings/security");
  revalidatePath("/admin/users");
  return { ok: true, recoveryCodes: codes };
}

export type DisableResult = { ok: true } | { error: string };

export async function disableTotpAction(input: {
  factorId: string;
}): Promise<DisableResult> {
  await requireProfile();
  const supabase = createClient();
  const { error } = await supabase.auth.mfa.unenroll({
    factorId: input.factorId,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/security");
  revalidatePath("/admin/users");
  return { ok: true };
}

export type RegenResult =
  | { ok: true; recoveryCodes: string[] }
  | { error: string };

export async function regenerateRecoveryCodesAction(): Promise<RegenResult> {
  await requireProfile();
  const supabase = createClient();
  const factor = await getMfaFactorState(supabase);
  if (factor.kind !== "verified") {
    return { error: "Enable TOTP before generating recovery codes." };
  }
  try {
    const codes = await generateAndPersistRecoveryCodes(supabase);
    revalidatePath("/settings/security");
    return { ok: true, recoveryCodes: codes };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not regenerate codes.",
    };
  }
}

/**
 * Sign this user out of every device, everywhere. Uses the admin
 * client with scope "global" so refresh tokens on other devices die
 * on their next request. Also clears the local cookies (auth-since
 * + the Supabase session cookies via signOut) so the current tab
 * lands on /login.
 *
 * ADMIN, STAFF, and FACTORY can all reach this — a lost phone is a
 * lost phone regardless of role.
 */
export async function signOutEverywhereAction(): Promise<
  { ok: true } | { error: string }
> {
  const profile = await requireProfile();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.signOut(profile.id, "global");
  if (error) return { error: error.message };
  // Sign the current browser session out too — the global signOut
  // above kills the refresh token but the access token stays valid
  // until it naturally expires (up to 1 h). Rip the cookie now so
  // the next request is unauthenticated immediately.
  const supabase = createClient();
  await supabase.auth.signOut().catch(() => undefined);
  cookies().delete("syncit_auth_since");
  redirect("/login?everywhere=1");
}
