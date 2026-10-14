import { Lora, DM_Sans } from "next/font/google";
import { MarketingAnalytics } from "@/components/analytics/pageview";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

// SY38 — rendered per request, on purpose. middleware.ts sends a
// nonce-only script policy ('strict-dynamic'); a page prerendered at
// build time has no nonce on its script tags, so the browser blocked
// every script on the marketing site — nothing interactive worked
// (calculators, help search, the consent bar). Rendering per request
// lets Next stamp the nonce. The pages are small and read no database.
export const dynamic = "force-dynamic";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${lora.variable} ${dmSans.variable} font-body`}>
      {children}
      {/* SY38 — cookie-less page views; asks before remembering a browser. */}
      <MarketingAnalytics enabled={Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)} />
    </div>
  );
}
