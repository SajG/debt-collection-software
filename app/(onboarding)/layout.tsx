import { Lora, DM_Sans } from "next/font/google";

// SY31 — /onboarding lives outside app/(dashboard) so the dashboard
// layout can redirect company-less users here without looping. Same
// fonts as the dashboard; no sidebar (the user may have no company).

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

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${lora.variable} ${dmSans.variable} font-body`}>
      {children}
    </div>
  );
}
