"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/monitoring";
import { safePath } from "@/lib/safe-redirect";
import { finishSignIn } from "@/lib/auth/finish-sign-in";
import { passwordSchema } from "@/lib/auth/password";
import {
  checkEmailOtpSendLimit,
  checkLoginRateLimit,
  recordLoginAttempt,
} from "@/lib/platform/rate-limit";
import { getMfaFactorState, tryConsumeRecoveryCode } from "@/lib/auth/mfa";

type ActionResult = { error: string } | never;

// SY42 — web sign-in: email + password, Google, or an emailed 6-digit
// code (the fallback for invited staff who have not set a password).
// SY31 had removed passwords because no set/reset path existed; the
// forgot/reset actions below and the invite-accept page now provide it.

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

  redirect(safePath(next, "/dashboard"));
}

// ─────────────────────────────────────────────────────────────────
// Email-OTP path (SY-email).
//
// Same allowlist rule as mobile: shouldCreateUser: false. If the
// address isn't already in auth.users (i.e. no admin ever invited
// this person), Supabase silently returns success without sending
// mail. From the caller's perspective every failure looks the same
// — generic message, no oracle.
//
// ADMIN accounts of a company with requireManagement2fa on are STILL
// subject to requireAdmin()'s aal2 gate — verifyOtp completes at
// aal1. See require-admin-aal.test.ts.
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

  // SY42 — shared post-auth routing (disabled / no company / MFA).
  return finishSignIn(supabase, callbackUrl);
}

// ─────────────────────────────────────────────────────────────────
// Password path (SY42). Returns the same generic message for unknown
// email and wrong password, and shares the per-email failure budget
// with every other PASSWORD attempt.
// ─────────────────────────────────────────────────────────────────

const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  callbackUrl: z.string().optional(),
});

export async function passwordLoginAction(input: {
  email: string;
  password: string;
  callbackUrl?: string;
}): Promise<ActionResult> {
  const parsed = passwordLoginSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password, callbackUrl } = parsed.data;

  const { limited, retryAfterMinutes } = await checkLoginRateLimit(email, "PASSWORD");
  if (limited) {
    return {
      error: `Too many attempts. Wait ${retryAfterMinutes} minutes and try again, or use "Email me a code".`,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await recordLoginAttempt(email, false, "PASSWORD");
    const unconfirmed = /not confirmed/i.test(error.message);
    return {
      error: unconfirmed
        ? "Please confirm your email first — check your inbox for the link."
        : "Email or password is incorrect.",
    };
  }
  await recordLoginAttempt(email, true, "PASSWORD");
  return finishSignIn(supabase, callbackUrl);
}

// Always {ok:true}: never reveals whether the address is registered.
export async function forgotPasswordAction(input: {
  email: string;
}): Promise<{ ok: true } | { error: string }> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email().max(254) })
    .safeParse(input);
  if (!parsed.success) return { error: "Enter a valid email address." };
  const { email } = parsed.data;

  const { limited, retryAfterMinutes } = await checkEmailOtpSendLimit(email);
  if (limited) {
    return { error: `Too many requests. Try again in ${retryAfterMinutes} minutes.` };
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: base ? `${base}/auth/callback?next=/reset-password` : undefined,
  });
  if (error) {
    await captureError(error, { where: "forgotPasswordAction", supabaseMessage: error.message });
  }
  await recordLoginAttempt(email, !error, "EMAIL_OTP");
  return { ok: true };
}

// Called from /reset-password with the recovery session the callback
// established. Also used by invited staff / Google users to add a
// password from settings later.
export async function setPasswordAction(input: {
  password: string;
}): Promise<{ ok: true } | { error: string }> {
  const parsed = passwordSchema.safeParse(input.password);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "That reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.message };
  return { ok: true };
}
