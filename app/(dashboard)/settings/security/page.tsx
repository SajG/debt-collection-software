import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import {
  countActiveRecoveryCodes,
  getMfaFactorState,
} from "@/lib/auth/mfa";
import { PageHeader, Card } from "../../_components/ui";
import { EnrollTotpPanel } from "./enroll-totp-panel";
import { DisableTotpButton } from "./disable-totp-button";
import { RegenerateRecoveryButton } from "./regenerate-recovery-button";
import { SignOutEverywhereButton } from "./sign-out-everywhere-button";

export const dynamic = "force-dynamic";

// Security settings.
//
// This page is deliberately EXEMPT from requireAdmin() so first-run
// admins can reach it at aal1 with no factor — otherwise there is
// no way to enrol MFA for the first time. Non-ADMIN roles see the
// same page but only get the "status" panel; enrol/disable are
// hidden because MFA is currently ADMIN-mandatory only.

type SearchParams = { first?: string };

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await requireProfile();
  const supabase = createClient();
  const factor = await getMfaFactorState(supabase);
  const activeCodes =
    factor.kind === "verified" ? await countActiveRecoveryCodes(supabase) : 0;

  if (profile.role !== "ADMIN" && factor.kind === "none") {
    // Non-admins land here only if they navigate directly.
    redirect("/settings");
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <PageHeader
        title="Security"
        subtitle={
          profile.role === "ADMIN"
            ? "Admin accounts require two-factor authentication (TOTP)."
            : "Two-factor authentication is optional for your role."
        }
      />

      {searchParams.first === "1" ? (
        <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your admin account needs TOTP enabled before you can reach
          the dashboard. Set it up below.
        </div>
      ) : null}

      <Card>
        <h2 className="text-base font-semibold">Authenticator app (TOTP)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use Google Authenticator, 1Password, or any other TOTP app.
          One 6-digit code every 30 seconds; nothing to remember.
        </p>
        <div className="mt-3">
          {factor.kind === "verified" ? (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              TOTP is enabled on your account.
            </div>
          ) : (
            <EnrollTotpPanel />
          )}
        </div>
        {factor.kind === "verified" ? (
          <div className="mt-4 border-t border-border pt-4">
            <DisableTotpButton factorId={factor.factorId} />
          </div>
        ) : null}
      </Card>

      {factor.kind === "verified" ? (
        <div className="mt-4">
          <Card>
            <h2 className="text-base font-semibold">Recovery codes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Single-use codes for when your authenticator is
              unavailable. Print them and keep them somewhere safe.
              You currently have <strong>{activeCodes}</strong>{" "}
              un-used {activeCodes === 1 ? "code" : "codes"}.
            </p>
            <div className="mt-3">
              <RegenerateRecoveryButton />
            </div>
          </Card>
        </div>
      ) : null}

      <div className="mt-4">
        <Card>
          <h2 className="text-base font-semibold">Sessions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            End every active session for your account — this browser, your
            phone, and any other computer you're signed in on. You'll
            need to sign in fresh everywhere after.
          </p>
          <div className="mt-3">
            <SignOutEverywhereButton ownerName={profile.ownerName} />
          </div>
        </Card>
      </div>
    </div>
  );
}
