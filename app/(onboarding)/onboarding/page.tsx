import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { resolveOrgIdFromProfile } from "@/lib/tenancy";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Get started — Syncit",
};

const INDUSTRIES = [
  "Adhesives/Chemicals",
  "Paints",
  "Pipes & fittings",
  "Electrical",
  "FMCG distribution",
  "Pharma distribution",
  "Other",
] as const;

type Step = "company" | "team" | "data" | "done";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = await resolveOrgIdFromProfile(user.id);
  const [profile, org, settings] = await Promise.all([
    db.profile.findUnique({
      where: { id: user.id },
      select: { ownerName: true },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        gstin: true,
        city: true,
        state: true,
        industry: true,
      },
    }),
    db.businessSettings.findUnique({
      where: { organizationId },
      select: { onboardingDone: true, onboardingStep: true },
    }),
  ]);

  if (settings?.onboardingDone) redirect("/dashboard");

  const startAt: Step = ((): Step => {
    const raw = settings?.onboardingStep;
    if (raw === "company" || raw === "team" || raw === "data" || raw === "done") return raw;
    return "company";
  })();

  const industry: (typeof INDUSTRIES)[number] = INDUSTRIES.includes(
    (org?.industry ?? "Other") as (typeof INDUSTRIES)[number],
  )
    ? (org!.industry as (typeof INDUSTRIES)[number])
    : "Other";

  return (
    <main className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-3xl border-b border-border bg-white px-6 py-6">
        <h1 className="text-xl font-semibold text-foreground">
          Welcome, {profile?.ownerName ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Four short steps and you&apos;re set. Skip any step — you can complete
          it later.
        </p>
      </div>
      <OnboardingForm
        startAt={startAt}
        initialCompany={{
          companyName: org?.name ?? "",
          gstin: org?.gstin ?? "",
          city: org?.city ?? "",
          state: org?.state ?? "",
          industry,
        }}
      />
    </main>
  );
}
