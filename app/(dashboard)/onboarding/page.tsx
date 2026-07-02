import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Get started — PayTrack",
};

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // If already onboarded, skip straight to dashboard.
  const settings = await db.businessSettings.findUnique({
    where: { profileId: user.id },
  });
  if (settings?.onboardingDone) redirect("/dashboard");

  const profile = await db.profile.findUnique({
    where: { id: user.id },
    select: { ownerName: true },
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <OnboardingForm ownerName={profile?.ownerName ?? "there"} />
      </div>
    </main>
  );
}
