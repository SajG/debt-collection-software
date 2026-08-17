import { redirect } from "next/navigation";
import { Lora, DM_Sans } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { Sidebar } from "./_components/sidebar";

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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profile, settings] = await Promise.all([
    db.profile.findUnique({
      where: { id: user.id },
      select: { businessName: true, ownerName: true, role: true },
    }),
    db.businessSettings.findUnique({
      where: { profileId: user.id },
      select: { onboardingDone: true },
    }),
  ]);

  const fontClasses = `${lora.variable} ${dmSans.variable} font-body`;

  // FACTORY accounts skip the AR onboarding wizard — they only need the
  // production console shell.
  const showShell =
    settings?.onboardingDone === true || profile?.role === "FACTORY";

  if (!showShell) {
    return <div className={fontClasses}>{children}</div>;
  }

  return (
    <div
      className={`${fontClasses} flex h-screen overflow-hidden bg-background`}
    >
      <Sidebar
        businessName={profile?.businessName ?? "My Business"}
        ownerName={profile?.ownerName ?? "User"}
        role={profile?.role ?? "STAFF"}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
