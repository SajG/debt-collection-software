import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveMembership } from "@/lib/tenant";
import { OpenInApp } from "@/components/open-in-app";

export const metadata: Metadata = {
  title: "You're in — Syncit",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// SY42 — where an accepted invitation lands: confirmation, a one-tap
// route into the phone app, and the way on to the web workspace.
export default async function WelcomePage() {
  const result = await getActiveMembership();
  if (result.status !== "ok") redirect("/login");
  const { profile, role } = result.ctx;
  const home = role === "FACTORY" ? "/production" : "/dashboard";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-muted/30">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">You&apos;re in, {profile.ownerName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account is ready. Pick where to start.
          </p>
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          {profile.email ? <OpenInApp email={profile.email} /> : null}
          <Link
            href={home}
            className="flex w-full items-center justify-center rounded-md border border-border px-4 py-2.5 text-sm font-semibold"
          >
            Continue on the web
          </Link>
        </div>
      </div>
    </main>
  );
}
