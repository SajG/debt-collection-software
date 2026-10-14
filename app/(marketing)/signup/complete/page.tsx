import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActiveMembership } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { isSignupEnabled } from "@/lib/signup-flag";
import { pendingInvitesForEmail } from "@/lib/platform/invitations";
import { CompleteForm } from "./complete-form";

export const metadata: Metadata = { title: "Set up your company — Syncit" };
export const dynamic = "force-dynamic";

// SY42 — where a Google user with no company lands to give the same
// company details a password sign-up collects.
export default async function CompleteSignupPage({
  searchParams,
}: {
  searchParams?: { ref?: string; new?: string };
}) {
  const result = await getActiveMembership();
  if (result.status === "signed-out") redirect("/login");
  if (result.status === "ok") redirect("/dashboard");
  if (result.status === "disabled") redirect("/account-disabled");
  if (!isSignupEnabled()) redirect("/onboarding");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Invited but signed in without using the link: point at the email
  // instead of letting them start a second, empty trial by accident.
  const invites = user.email ? await pendingInvitesForEmail(user.email) : [];
  if (invites.length > 0 && searchParams?.new !== "1") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-muted/30">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-xl font-bold tracking-tight">You have an invitation</h1>
          <p className="text-sm text-muted-foreground">
            {invites.map((i) => i.companyName).join(", ")} invited {user.email}. Open the invitation
            email and click <strong className="text-foreground">Accept invitation</strong> to join.
          </p>
          <a
            href="/signup/complete?new=1"
            className="block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            No, create my own company instead
          </a>
        </div>
      </main>
    );
  }
  const name = (user.user_metadata?.name as string | undefined) ?? (user.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-muted/30">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Set up your company</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A few details so we can set up your 14-day trial.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <CompleteForm email={user.email ?? ""} ownerName={name} referralCode={searchParams?.ref} />
        </div>
      </div>
    </main>
  );
}
