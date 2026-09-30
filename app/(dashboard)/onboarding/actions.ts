"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { resolveOrgIdFromProfile } from "@/lib/tenancy";
import { captureError } from "@/lib/monitoring";

// SY23 — 4-step onboarding wizard.
//
// Each step updates BusinessSettings + Organization and advances
// `onboardingStep`. The wizard is skippable at any point (the "Done"
// step just needs to fire completeOnboardingAction). Progress lives
// in BusinessSettings so a mid-wizard sign-out resumes cleanly.
//
// Sample data live in lib/onboarding/sample.ts as a self-contained
// seed the admin can also purge from settings later.

const INDUSTRIES = [
  "Adhesives/Chemicals",
  "Paints",
  "Pipes & fittings",
  "Electrical",
  "FMCG distribution",
  "Pharma distribution",
  "Other",
] as const;

type ActionResult = { error: string } | { ok: true } | never;

const companySchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/i, "GSTIN format is 15 chars, e.g. 27ABCDE1234F1Z5")
    .optional()
    .or(z.literal("")),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  industry: z.enum(INDUSTRIES),
});

export async function saveCompanyStep(input: {
  companyName: string;
  gstin?: string;
  city?: string;
  state?: string;
  industry: string;
}): Promise<ActionResult> {
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = await resolveOrgIdFromProfile(user.id);
  await db.$transaction([
    db.organization.update({
      where: { id: organizationId },
      data: {
        name: parsed.data.companyName,
        gstin: parsed.data.gstin || null,
        city: parsed.data.city || null,
        state: parsed.data.state || null,
        industry: parsed.data.industry,
      },
    }),
    db.profile.update({
      where: { id: user.id },
      data: { businessName: parsed.data.companyName },
    }),
    db.businessSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        onboardingStep: "team",
        companyGstNumber: parsed.data.gstin || null,
        companyState: parsed.data.state || null,
        companyCityPin: parsed.data.city || null,
      },
      update: {
        onboardingStep: "team",
        companyGstNumber: parsed.data.gstin || null,
        companyState: parsed.data.state || null,
        companyCityPin: parsed.data.city || null,
      },
    }),
  ]);

  return { ok: true };
}

const teamMemberSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "10-digit Indian mobile"),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["ADMIN", "STAFF", "FACTORY"]),
});

const teamSchema = z.object({
  members: z.array(teamMemberSchema).max(50),
});

export async function saveTeamStep(input: {
  members: {
    ownerName: string;
    phone: string;
    email: string;
    role: "ADMIN" | "STAFF" | "FACTORY";
  }[];
}): Promise<ActionResult> {
  const parsed = teamSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = await resolveOrgIdFromProfile(user.id);
  const { createUserAction } = await import("../admin/users/actions");
  const errors: string[] = [];

  for (const m of parsed.data.members) {
    const res = await createUserAction({
      ownerName: m.ownerName,
      phone: m.phone,
      email: m.email,
      role: m.role,
    }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    if ("error" in res) {
      errors.push(`${m.email}: ${res.error}`);
    }
  }

  await db.businessSettings.upsert({
    where: { organizationId },
    create: { organizationId, onboardingStep: "data" },
    update: { onboardingStep: "data" },
  });

  if (errors.length > 0) {
    // Advance the wizard anyway — the admin can fix invites from
    // /admin/users. Return the joined list so the UI can surface it.
    return { error: errors.join("; ") };
  }
  return { ok: true };
}

const dataStepSchema = z.object({
  choice: z.enum(["TALLY", "EXCEL", "SAMPLE", "SKIP"]),
});

export async function saveDataStep(input: {
  choice: "TALLY" | "EXCEL" | "SAMPLE" | "SKIP";
}): Promise<ActionResult> {
  const parsed = dataStepSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = await resolveOrgIdFromProfile(user.id);

  if (parsed.data.choice === "SAMPLE") {
    try {
      const { seedSampleData } = await import("@/lib/onboarding/sample");
      await seedSampleData(organizationId, user.id);
    } catch (e) {
      await captureError(e, {
        scope: "onboarding.sample-seed",
        organizationId,
      });
    }
  }

  const accountingTool =
    parsed.data.choice === "TALLY"
      ? "TALLY"
      : parsed.data.choice === "EXCEL"
        ? "EXCEL"
        : "OTHER";

  await db.businessSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      onboardingStep: "done",
      accountingTool,
    },
    update: {
      onboardingStep: "done",
      accountingTool,
    },
  });

  return { ok: true };
}

export async function completeOnboardingAction(): Promise<never> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = await resolveOrgIdFromProfile(user.id);
  await db.businessSettings.upsert({
    where: { organizationId },
    create: { organizationId, onboardingDone: true, onboardingStep: null },
    update: { onboardingDone: true, onboardingStep: null },
  });
  redirect("/dashboard");
}

// Legacy single-step compat — the previous OnboardingForm calls this
// with just an accountingTool. Kept so anything still hitting the
// old path works; new UI uses the four *Step actions above.
export async function saveOnboardingAction(input: {
  accountingTool: "TALLY" | "ZOHO" | "SAP" | "EXCEL" | "OTHER";
}): Promise<{ error: string } | never> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = await resolveOrgIdFromProfile(user.id);
  await db.businessSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      accountingTool: input.accountingTool,
      onboardingDone: true,
    },
    update: {
      accountingTool: input.accountingTool,
      onboardingDone: true,
    },
  });
  redirect("/dashboard");
}
