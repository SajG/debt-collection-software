"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/monitoring";

// SY23 — self-serve signup.
//
// The signup path is the ONLY place where signInWithOtp fires with
// shouldCreateUser:true. Everywhere else keeps the allowlist gate.
//
// Two-step:
//   1. requestSignupCodeAction — creates a rate-limit row (per IP +
//      per email domain), asks Supabase to send the OTP.
//   2. verifySignupCodeAction  — verifies the code, then in one
//      transaction: Organization + BusinessSettings + Membership
//      (ADMIN, isOwner=true) + Profile fields. Pins the JWT's
//      active_org_id claim so the very first request lands scoped.
//
// Rate limits (SignupAttempt table, prisma/schema.prisma):
//   * 5 per IP per hour
//   * 20 per email domain per hour (blunts a domain-wide flood)

const FAKE_DOMAIN_RE = /\.(local|test|invalid|internal|localhost|example)$/i;

const requestSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
});

const verifySchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/),
  token: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

const IP_LIMIT_PER_HOUR = 5;
const DOMAIN_LIMIT_PER_HOUR = 20;

function clientIp(): string {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

function domainOf(email: string): string {
  return email.split("@")[1] ?? "";
}

type Result = { error: string } | { ok: true } | never;

export async function requestSignupCodeAction(input: {
  ownerName: string;
  companyName: string;
  email: string;
  phone: string;
}): Promise<Result> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const { email } = parsed.data;
  const domain = domainOf(email);
  if (FAKE_DOMAIN_RE.test(email)) {
    return { error: "Use a real deliverable email address." };
  }

  const ip = clientIp();
  const windowStart = new Date(Date.now() - 60 * 60 * 1000);

  const [ipCount, domainCount] = await Promise.all([
    db.signupAttempt.count({ where: { ip, createdAt: { gte: windowStart } } }),
    db.signupAttempt.count({
      where: { emailDomain: domain, createdAt: { gte: windowStart } },
    }),
  ]);
  if (ipCount >= IP_LIMIT_PER_HOUR) {
    return {
      error: "Too many sign-up attempts from this network. Try again in an hour.",
    };
  }
  if (domainCount >= DOMAIN_LIMIT_PER_HOUR) {
    return {
      error: "Too many sign-ups from this domain today. Contact us if you need help.",
    };
  }

  await db.signupAttempt.create({
    data: { ip, emailDomain: domain, successful: false },
  });

  // If an active Membership already exists for this email, quietly
  // redirect the user to /login instead of creating a duplicate auth
  // user. Response is still {ok:true} so the code page renders.
  const existingProfile = await db.profile.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingProfile) {
    // Fire an OTP for the existing user via the normal login flow —
    // shouldCreateUser stays false to avoid creating a duplicate.
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) await captureError(error, { where: "requestSignupCodeAction/existing" });
    return { ok: true };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    await captureError(error, {
      where: "requestSignupCodeAction",
      supabaseMessage: error.message,
    });
  }
  return { ok: true };
}

export async function verifySignupCodeAction(input: {
  ownerName: string;
  companyName: string;
  email: string;
  phone: string;
  token: string;
}): Promise<Result> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { ownerName, companyName, email, phone, token } = parsed.data;

  const supabase = createClient();
  const { error, data } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error || !data.user) {
    return { error: "That code didn't work. Ask for a fresh one." };
  }
  const userId = data.user.id;

  const admin = createAdminClient();
  // Bulk provisioning inside a single transaction so a failure
  // between Profile / Organization / Membership doesn't leave a
  // half-baked tenant behind.
  const orgSlug = slugify(companyName) + "-" + userId.slice(0, 6);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const existing = await db.profile.findUnique({ where: { id: userId } });
  const org = await db.$transaction(async (tx) => {
    if (!existing) {
      await tx.profile.create({
        data: {
          id: userId,
          businessName: companyName,
          ownerName,
          phone,
          email,
          role: "ADMIN",
          isActive: true,
        },
      });
    }
    const created = await tx.organization.create({
      data: {
        name: companyName,
        slug: orgSlug,
        plan: "TRIAL",
        trialEndsAt,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    await tx.membership.create({
      data: {
        organizationId: created.id,
        profileId: userId,
        role: "ADMIN",
        isOwner: true,
        isActive: true,
      },
    });
    await tx.businessSettings.create({
      data: {
        organizationId: created.id,
        onboardingDone: false,
        onboardingStep: "company",
        requireManagement2fa: false,
      },
    });
    return created;
  });

  // Pin active_org_id on the JWT so the very next request lands
  // scoped. Also mark the signup attempt successful for audit.
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...(data.user.app_metadata ?? {}),
      active_org_id: org.id,
    },
  });

  // Fire-and-forget welcome email. sendEmail is a no-op when
  // RESEND_API_KEY is missing so preview envs stay silent.
  void (async () => {
    try {
      const { sendEmail } = await import("@/lib/email/send");
      const { welcomeEmail } = await import("@/lib/email/templates");
      const tmpl = welcomeEmail({
        ownerName,
        companyName,
        trialEndsAt,
      });
      await sendEmail({ to: email, ...tmpl });
    } catch (e) {
      await captureError(e, { scope: "signup.welcome-email", email });
    }
  })();
  await db.signupAttempt
    .updateMany({
      where: {
        emailDomain: domainOf(email),
        ip: clientIp(),
        successful: false,
      },
      data: { successful: true },
    })
    .catch(() => undefined);

  // Same 90-day absolute session cookie as verifyEmailCodeAction.
  cookies().set("syncit_auth_since", String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  redirect("/onboarding");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "org";
}
