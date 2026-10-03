import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveMembership, tenantDb } from "@/lib/tenant";
import { listOwnMemberships as listOwnMembershipRows } from "@/lib/platform/identity";
import {
  ONBOARDING_ONE_BY_ONE_MESSAGE,
  ONBOARDING_WHATSAPP_URL,
  isSignupEnabled,
} from "@/lib/signup-flag";
import { OnboardingForm } from "./onboarding-form";
import { CompanyPicker } from "./company-picker";

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
  // SY31 — the company comes ONLY from the caller's active Membership.
  // No membership → no company data is read or written here.
  const result = await getActiveMembership();
  if (result.status === "signed-out" || result.status === "no-profile") {
    redirect("/login");
  }
  if (result.status === "disabled") redirect("/account-disabled");
  if (result.status === "no-company") {
    return <NoCompany membershipCount={result.membershipCount} />;
  }

  const { profile, organizationId, role } = result.ctx;
  const db = tenantDb(organizationId);
  const [org, settings] = await Promise.all([
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

  // Only the company's ADMIN sets it up; everyone else waits.
  if (role !== "ADMIN") {
    return (
      <Shell title={`Welcome, ${profile.ownerName}`}>
        <p className="text-sm text-muted-foreground">
          Your company admin is still setting up {org?.name ?? "Syncit"}.
          You&apos;ll get in as soon as they finish.
        </p>
      </Shell>
    );
  }

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
          Welcome, {profile.ownerName}
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

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {children}
      </div>
    </main>
  );
}

async function NoCompany({ membershipCount }: { membershipCount: number }) {
  // Several companies but no valid active one on this session —
  // let them pick explicitly rather than guessing.
  if (membershipCount > 1) {
    const memberships = await listOwnMemberships();
    return (
      <Shell title="Choose a company">
        <p className="text-sm text-muted-foreground">
          You belong to more than one company. Pick the one to open.
        </p>
        <CompanyPicker memberships={memberships} />
      </Shell>
    );
  }

  if (!isSignupEnabled()) {
    return (
      <Shell title="You're not part of a company yet">
        <p className="text-sm text-muted-foreground">
          {ONBOARDING_ONE_BY_ONE_MESSAGE}. If your company already uses
          Syncit, ask your admin to add you with this email address.
        </p>
        <a
          href={ONBOARDING_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Message us on WhatsApp
        </a>
      </Shell>
    );
  }

  return (
    <Shell title="You're not part of a company yet">
      <p className="text-sm text-muted-foreground">
        Start a trial for your company, or ask your company admin to add
        you with this email address.
      </p>
      <Link
        href="/signup"
        className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Start free trial
      </Link>
    </Shell>
  );
}

async function listOwnMemberships() {
  const { createClient } = await import("@/lib/supabase/server");
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return [];
  const rows = await listOwnMembershipRows(user.id);
  return rows.map((m) => ({
    id: m.organizationId,
    name: m.organization.name,
    role: m.role,
  }));
}
