"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/monitoring";
import {
  checkEmailOtpSendLimit,
  checkLoginRateLimit,
  recordLoginAttempt,
} from "@/lib/rate-limit";
import {
  currentAssuranceLevel,
  getMfaFactorState,
  tryConsumeRecoveryCode,
} from "@/lib/auth/mfa";

type ActionResult = { error: string } | never;

// SY23 — password auth removed. Web sign-in is emailed 6-digit codes
// or "Continue with Google". The Supabase project should have the
// Email+password provider DISABLED — see docs/LOGIN-RUNBOOK.md.

// ── Challenge action — used by /login/challenge ──────────────────

const challengeSchema = z.object({
  code: z.string().trim().min(1),
  next: z.string().optional(),
  useRecovery: z.boolean().optional(),
});

type ChallengeInput = z.infer<typeof challengeSchema>;

export async function challengeAction(
  input: ChallengeInput,
): Promise<ActionResult> {
  const parsed = challengeSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter your 6-digit code." };
  const { code, next, useRecovery } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your sign-in session expired. Start again." };
  }
  const email = user.email ?? "";

  const factor = useRecovery ? "RECOVERY" : "TOTP";
  const { limited } = await checkLoginRateLimit(email, factor);
  if (limited) {
    return {
      error: `Too many attempts on this factor. Wait 15 minutes and try again.`,
    };
  }

  if (useRecovery) {
    const ok = await tryConsumeRecoveryCode(user.id, code);
    if (!ok) {
      await recordLoginAttempt(email, false, "RECOVERY");
      return { error: "Recovery code is not valid." };
    }
    await recordLoginAttempt(email, true, "RECOVERY");
    // Recovery-code redemption upgrades the session by re-signing
    // the user out and back in with an aal2 assertion header. The
    // cleanest way to actually achieve aal2 without a TOTP is to
    // sign them out and let them retry the challenge from a
    // freshly-issued session, using a still-valid recovery code as
    // the aal-raising factor. Supabase does not natively model
    // recovery codes as a factor kind, so we take the pragmatic
    // route: revoke the current session so requireAdmin's aal2
    // gate reroutes to /settings/security, where the user is
    // instructed to disable + re-enrol TOTP from scratch.
    // For now: accept the code, drop the session, tell the user.
    await supabase.auth.signOut();
    redirect("/login?recovered=1");
  }

  const factorState = await getMfaFactorState(supabase);
  if (factorState.kind !== "verified") {
    // Shouldn't happen — the caller must have a factor to be here.
    redirect("/settings/security");
  }

  const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({
    factorId: factorState.factorId,
  });
  if (chalErr || !chal) {
    return { error: "Could not start the challenge. Please try again." };
  }
  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId: factorState.factorId,
    challengeId: chal.id,
    code,
  });
  if (verifyErr) {
    await recordLoginAttempt(email, false, "TOTP");
    return { error: "That code is not valid. Try again." };
  }
  await recordLoginAttempt(email, true, "TOTP");

  const dest = next && next.startsWith("/") ? next : "/dashboard";
  redirect(dest);
}

// ─────────────────────────────────────────────────────────────────
// Email-OTP path (SY-email) — alternative to password.
//
// Same allowlist rule as mobile: shouldCreateUser: false. If the
// address isn't already in auth.users (i.e. no admin ever invited
// this person), Supabase silently returns success without sending
// mail. From the caller's perspective every failure looks the same
// — generic message, no oracle.
//
// ADMIN accounts signing in via this path are STILL subject to
// requireAdmin()'s aal2 gate — verifyOtp completes at aal1, and
// hitting any /dashboard route bounces them to /login/challenge for
// TOTP. See require-admin-aal.test.ts.
// ─────────────────────────────────────────────────────────────────

const requestCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  callbackUrl: z.string().optional(),
});

export async function requestEmailCodeAction(input: {
  email: string;
  callbackUrl?: string;
}): Promise<{ ok: true } | { error: string }> {
  const parsed = requestCodeSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid email address." };
  const { email } = parsed.data;

  // Cap: 3 sends per email per 15 minutes. Counts every send
  // (successful + failed) — a successful send still burns provider
  // quota, so the check is on totals, not fails.
  const { limited, retryAfterMinutes } = await checkEmailOtpSendLimit(email);
  if (limited) {
    return {
      error: `Too many code requests. Try again in ${retryAfterMinutes} minutes.`,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  // Record every send so the rate limit works. Treat Supabase's own
  // errors as failures for accounting; the outward result stays
  // uniformly {ok:true} regardless — SY15.8, no enumeration oracle.
  // The rate-limit branch above IS allowed to leak (attacker only
  // learns their own limit), but "email not on the allowlist" must
  // look identical to a successful send.
  //
  // Server-side log for real Supabase faults (SMTP down, provider
  // error, etc.). Never returned to the caller — the user always
  // sees {ok:true}, so without this log a broken SMTP link would
  // stay invisible until a user complained.
  if (error) {
    await captureError(error, {
      where: "requestEmailCodeAction",
      supabaseMessage: error.message,
    });
  }
  await recordLoginAttempt(email, !error, "EMAIL_OTP");
  return { ok: true };
}

const verifyCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  token: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
  callbackUrl: z.string().optional(),
});

export async function verifyEmailCodeAction(input: {
  email: string;
  token: string;
  callbackUrl?: string;
}): Promise<ActionResult> {
  const parsed = verifyCodeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { email, token, callbackUrl } = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) {
    await recordLoginAttempt(email, false, "EMAIL_OTP");
    return { error: "That code didn't work. Try requesting a fresh one." };
  }
  await recordLoginAttempt(email, true, "EMAIL_OTP");

  // Stamp the absolute-session cookie so middleware enforces 90-day
  // absolute lifetime on this path too.
  cookies().set("syncit_auth_since", String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  // Post-OTP role routing — matches loginAction so both web sign-in
  // paths land in the same place. FACTORY → /production, STAFF →
  // /dashboard, ADMIN → MFA check (aal1 → /login/challenge, no factor
  // → /settings/security?first=1, aal2 → dashboard). callbackUrl, when
  // safe, wins over the role default.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const profile = user
    ? await admin
        .from("Profile")
        .select("role, isActive")
        .eq("id", user.id)
        .maybeSingle()
    : null;
  const role = profile?.data?.role as
    | "ADMIN"
    | "STAFF"
    | "FACTORY"
    | undefined;
  const isActive = profile?.data?.isActive ?? true;

  if (!isActive) {
    await supabase.auth.signOut();
    redirect("/account-disabled");
  }

  const roleHome =
    role === "FACTORY" ? "/production" : "/dashboard";
  const safeCallback =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : roleHome;

  if (role !== "ADMIN") {
    redirect(safeCallback);
  }

  // Pilot escape hatch — mirrors loginAction and requireAdmin.
  if (process.env.AUTH_SKIP_MFA === "1") {
    redirect(safeCallback);
  }

  const factor = await getMfaFactorState(supabase);
  if (factor.kind !== "verified") {
    redirect("/settings/security?first=1");
  }

  const aal = await currentAssuranceLevel(supabase);
  if (aal === "aal2") {
    redirect(safeCallback);
  }

  const q = new URLSearchParams({ next: safeCallback });
  redirect(`/login/challenge?${q.toString()}`);
}
