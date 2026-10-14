import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { JsonLd, breadcrumbLd } from "@/components/content/json-ld";

export const metadata: Metadata = {
  title: "Free tools for businesses that sell on credit — Syncit",
  description:
    "Free calculators and templates: MSME 45-day payment due date (43B(h)), DSO calculator, and an outstanding ageing Excel template.",
  alternates: { canonical: "https://getsyncit.app/tools" },
};

const TOOLS = [
  {
    href: "/tools/msme-45-day-payment-calculator",
    title: "MSME 45-day payment calculator",
    body: "Section 43B(h): the last date to pay a micro or small supplier, and what is disallowed if you miss it.",
  },
  {
    href: "/tools/dso-calculator",
    title: "DSO calculator",
    body: "How many days customers take to pay, how far that is from your terms, and what the delay costs.",
  },
  {
    href: "/tools/outstanding-ageing-template",
    title: "Outstanding ageing template (Excel)",
    body: "Type your unpaid bills; days overdue and the 0–30, 31–60, 61–90, 90+ buckets fill in by themselves.",
  },
];

export default function ToolsIndexPage() {
  return (
    <SiteShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tools", path: "/tools" }])} />
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: mkt.teal }}>
          Free tools
        </p>
        <h1 className="font-display font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          Tools for businesses that sell on credit
        </h1>
        <p className="text-lg mb-8" style={{ color: mkt.ink2 }}>
          No sign-up. Nothing you type leaves your browser.
        </p>
        <ul className="space-y-4">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="block rounded-2xl border bg-white p-6 transition-shadow hover:shadow-sm"
                style={{ borderColor: mkt.border }}
              >
                <h2 className="font-display font-bold text-xl mb-1" style={{ color: mkt.ink }}>
                  {t.title}
                </h2>
                <p className="text-base leading-relaxed" style={{ color: mkt.ink2 }}>
                  {t.body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </SiteShell>
  );
}
