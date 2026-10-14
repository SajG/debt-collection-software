"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  countRecentSignupAttempts,
  markSignupAttemptsSuccessful,
  recordSignupAttempt,
} from "@/lib/platform/signup";
import { createLead } from "@/lib/platform/leads";
import { provisionFromLead } from "@/lib/platform/provision-from-lead";
import { ensureStubProfile } from "@/lib/platform/resolve";
import { countActiveMemberships } from "@/lib/platform/identity";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/monitoring";
import { ONBOARDING_ONE_BY_ONE_MESSAGE, isSignupEnabled } from "@/lib/signup-flag";
import { ATTRIBUTION_COOKIE, parseAttribution } from "@/lib/attribution";
import { companyDetailsSchema, type CompanyDetailsInput } from "@/lib/validation/company-details";
import { passwordSchema } from "@/lib/auth/password";

// SY42 — self-serve signup with a password (or Google).
//
//   signUpWithPasswordAction
//     validate → rate limit → auth.signUp (Supabase emails a confirm
//     link) → SignupLead(PENDING_VERIFY). The company is created in
//     /auth/callback once the link is clicked, from the stored lead.
//   completeGoogleSignupAction
//     a Google user with no company submits the same details → lead →
//     company → /onboarding.
//
// An address that is already registered gets the same "check your
// email" answer as a new one — no enumeration oracle.

const SIGNUP_CLOSED = `${ONBOARDING_ONE_BY_ONE_MESSAGE}.`;
const IP_LIMIT_PER_HOUR = 5;
const DOMAIN_LIMIT_PER_HOUR = 20;

const refSchema = z.string().trim().regex(/^[A-Za-z0-9]{1,16}$/).optional();

function clientIp(): string {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

function domainOf(email: string): string {
  return email.split("@")[1] ?? "";
}

function attributionFor(ref?: string) {
  const a = parseAttribution(cookies().get(ATTRIBUTION_COOKIE)?.value);
  const code = refSchema.safeParse(ref);
  if (code.success && code.data) a.referralCode = code.data.toUpperCase();
  return a;
}

type Result = { error: string } | { ok: true; checkEmail: true };

async function underRateLimit(email: string): Promise<string | null> {
  const ip = clientIp();
  const domain = domainOf(email);
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const { ip: ipCount, domain: domainCount } = await countRecentSignupAttempts(ip, domain, since);
  if (ipCount >= IP_LIMIT_PER_HOUR) {
    return "Too many sign-up attempts from this network. Try again in an hour.";
  }
  if (domainCount >= DOMAIN_LIMIT_PER_HOUR) {
    return "Too many sign-ups from this domain today. Contact us if you need help.";
  }
  await recordSignupAttempt(ip, domain);
  return null;
}

export async function signUpWithPasswordAction(input: {
  details: CompanyDetailsInput;
  password: string;
  ref?: string;
}): Promise<Result> {
  if (!isSignupEnabled()) return { error: SIGNUP_CLOSED };
  const details = companyDetailsSchema.safeParse(input.details);
  if (!details.success) return { error: details.error.errors[0].message };
  const password = passwordSchema.safeParse(input.password);
  if (!password.success) return { error: password.error.errors[0].message };

  const limited = await underRateLimit(details.data.email);
  if (limited) return { error: limited };

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: details.data.email,
    password: password.data,
    options: {
      emailRedirectTo: base ? `${base}/auth/callback?next=/onboarding` : undefined,
      data: { name: details.data.ownerName },
    },
  });
  if (error) {
    await captureError(error, { where: "signUpWithPasswordAction", supabaseMessage: error.message });
    if (/password/i.test(error.message)) {
      return { error: "That password is too weak or has appeared in a data breach. Choose another." };
    }
    return { ok: true, checkEmail: true };
  }
  // Supabase returns an obfuscated user with no identities when the
  // address is already registered. Say nothing different.
  if (!data.user || (data.user.identities ?? []).length === 0) {
    return { ok: true, checkEmail: true };
  }

  const lead = await createLead({
    authMethod: "password",
    profileId: data.user.id,
    details: details.data,
    attribution: attributionFor(input.ref),
    ip: clientIp(),
    userAgent: headers().get("user-agent"),
  });

  // Project has "Confirm email" off: a session exists already, so the
  // company can be created straight away.
  if (data.session) {
    await ensureStubProfile(data.user);
    await provisionFromLead({
      userId: data.user.id,
      lead,
      appMetadata: data.user.app_metadata,
    });
    await markSignupAttemptsSuccessful(clientIp(), domainOf(details.data.email));
    cookies().set("syncit_auth_since", String(Date.now()), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
    redirect("/onboarding");
  }
  await markSignupAttemptsSuccessful(clientIp(), domainOf(details.data.email));
  return { ok: true, checkEmail: true };
}

export async function completeGoogleSignupAction(input: {
  details: CompanyDetailsInput;
  ref?: string;
}): Promise<{ error: string } | never> {
  if (!isSignupEnabled()) return { error: SIGNUP_CLOSED };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const parsed = companyDetailsSchema.safeParse({
    ...input.details,
    // The Google-verified address is authoritative.
    email: user.email ?? input.details.email,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  if ((await countActiveMemberships(user.id)) > 0) redirect("/dashboard");

  await ensureStubProfile(user);
  const lead = await createLead({
    authMethod: "google",
    profileId: user.id,
    details: parsed.data,
    attribution: attributionFor(input.ref),
    ip: clientIp(),
    userAgent: headers().get("user-agent"),
  });
  await provisionFromLead({
    userId: user.id,
    lead,
    appMetadata: user.app_metadata,
  });
  redirect("/onboarding");
}
