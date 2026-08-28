import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentAssuranceLevel, getMfaFactorState } from "@/lib/auth/mfa";
import { ChallengeForm } from "./challenge-form";

// Second-factor challenge. Rendered after a successful password
// grant when the user has a verified TOTP factor but the session is
// still at aal1. On success, requireAdmin() sees aal2 and lets them
// through.

export const dynamic = "force-dynamic";

type SearchParams = { next?: string; recovered?: string };

export default async function ChallengePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const factor = await getMfaFactorState(supabase);
  if (factor.kind !== "verified") {
    // Nothing to challenge against — bounce to enrol.
    redirect("/settings/security");
  }
  const aal = await currentAssuranceLevel(supabase);
  if (aal === "aal2") {
    // Already elevated (browser refresh, back button). Go on.
    redirect(searchParams.next?.startsWith("/") ? searchParams.next : "/dashboard");
  }

  return (
    <div className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Two-factor code
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Open your authenticator app and enter the 6-digit code for your
        Syncit / PayTrack admin account.
      </p>
      <div className="mt-6">
        <ChallengeForm next={searchParams.next ?? "/dashboard"} />
      </div>
    </div>
  );
}
