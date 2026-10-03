import { Lora, DM_Sans } from "next/font/google";
import { listOwnMemberships } from "@/lib/platform/identity";
import { isTallyEnabled } from "@/lib/settings";
import { requireMembership, tenantDb } from "@/lib/tenant";
import { Sidebar } from "./_components/sidebar";
import { CommandPalette } from "./_components/command-palette";
import { BillingBanner } from "./_components/billing-banner";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SY31 — no active Membership → /onboarding (requireMembership
  // redirects). Nothing below renders for a user without a company,
  // and the role shown is the active Membership's, never Profile.role.
  const { profile, organizationId, role } = await requireMembership();
  const db = tenantDb(organizationId);
  const [settings, tallyOn, memberships, org] = await Promise.all([
    db.businessSettings.findUnique({
      where: { organizationId },
      select: { onboardingDone: true },
    }),
    isTallyEnabled(db),
    listOwnMemberships(profile.id),
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        status: true,
        plan: true,
        trialEndsAt: true,
        lockReason: true,
        pastDueSince: true,
        deletionScheduledFor: true,
      },
    }),
  ]);

  // SY23 — company switcher payload.
  const switcher = memberships.map((m) => ({
    id: m.organizationId,
    name: m.organization.name,
    role: m.role,
  }));
  const activeOrg = switcher.find((s) => s.id === organizationId);

  const fontClasses = `${lora.variable} ${dmSans.variable} font-body`;

  // FACTORY accounts skip the AR onboarding wizard — they only need the
  // production console shell.
  const showShell =
    settings?.onboardingDone === true || role === "FACTORY";

  if (!showShell) {
    return <div className={fontClasses}>{children}</div>;
  }

  return (
    <div
      className={`${fontClasses} flex h-screen overflow-hidden bg-background`}
    >
      <Sidebar
        businessName={profile.businessName ?? "My Business"}
        ownerName={profile.ownerName ?? "User"}
        role={role}
        tallyEnabled={tallyOn}
        activeOrg={activeOrg}
        memberships={switcher}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {org && (
          <BillingBanner
            status={org.status}
            plan={org.plan}
            trialEndsAt={org.trialEndsAt}
            lockReason={org.lockReason}
            pastDueSince={org.pastDueSince}
            deletionScheduledFor={org.deletionScheduledFor}
            isOwner={memberships.some((m) => m.organizationId === organizationId && m.isOwner)}
          />
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
