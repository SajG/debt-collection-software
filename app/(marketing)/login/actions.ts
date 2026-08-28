"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
});

type LoginInput = z.infer<typeof loginSchema>;
type ActionResult = { error: string } | never;

// After a successful password grant, the router picks between four
// destinations:
//
//   ADMIN, no verified factor  → /settings/security     (forced enrol)
//   ADMIN, factor, aal1        → /login/challenge        (TOTP now)
//   ADMIN, factor, aal2        → /dashboard              (fully in)
//   non-ADMIN                  → /dashboard              (no MFA req)
//
// non-ADMIN users are not yet required to enrol MFA. That is a
// deliberate scope choice — MFA is expensive in support cost and
// STAFF/FACTORY have no destructive server actions. If that changes,
// the branch below is the one line to widen.

export async function loginAction(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your email and password and try again." };
  }

  const { email, password, callbackUrl } = parsed.data;

  const { limited, retryAfterMinutes } = await checkLoginRateLimit(
    email,
    "PASSWORD",
  );
  if (limited) {
    return {
      error: `Too many failed attempts. Please wait ${retryAfterMinutes} minutes and try again.`,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await recordLoginAttempt(email, false, "PASSWORD");
    if (error.message.includes("Invalid login credentials")) {
      return { error: "The email or password you entered is incorrect." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "Please check your inbox and confirm your email first." };
    }
    if (error.status === 429) {
      return { error: "Too many attempts. Please wait a few minutes and try again." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  await recordLoginAttempt(email, true, "PASSWORD");

  // Stamp the absolute-session cookie. Middleware compares this on
  // every request and bounces to /login after 90 days regardless of
  // activity. Set once per fresh sign-in — never refreshed by token
  // rotation. See middleware.ts.
  cookies().set("syncit_auth_since", String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // 90 days matches the middleware cap; when the cookie expires
    // it disappears from the request and the middleware falls back
    // to Supabase's own TTL rules.
    maxAge: 60 * 60 * 24 * 90,
  });

  // Post-password branch. We need the profile role plus the MFA
  // state of the newly-issued session.
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
  const role = profile?.data?.role as "ADMIN" | "STAFF" | "FACTORY" | undefined;
  const isActive = profile?.data?.isActive ?? true;

  if (!isActive) {
    // AuthContext will bounce them, but be explicit.
    await supabase.auth.signOut();
    redirect("/account-disabled");
  }

  const safeCallback =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";

  if (role !== "ADMIN") {
    redirect(safeCallback);
  }

  // ADMIN path — MFA required.
  const factor = await getMfaFactorState(supabase);
  if (factor.kind !== "verified") {
    // No verified factor yet. Force them into the security page. It
    // reads at aal1 by design — otherwise there is no way to first-run
    // enrol.
    redirect("/settings/security?first=1");
  }

  const aal = await currentAssuranceLevel(supabase);
  if (aal === "aal2") {
    redirect(safeCallback);
  }

  // aal1 + verified factor → challenge screen. The callback is
  // carried across so the user lands where they meant to go.
  const q = new URLSearchParams({ next: safeCallback });
  redirect(`/login/challenge?${q.toString()}`);
}

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
  // errors as failures for accounting; the outward message stays
  // generic.
  await recordLoginAttempt(email, !error, "EMAIL_OTP");
  if (error) {
    return {
      error:
        "We couldn't send a code. Ask your admin to check your email is on file.",
    };
  }
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

  const safeCallback =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
  redirect(safeCallback);
}
