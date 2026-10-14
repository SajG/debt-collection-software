import Link from "next/link";
import { mkt } from "./tokens";

const PRODUCT_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Tally", href: "/tally" },
  { label: "Pricing", href: "/pricing" },
  { label: "Download", href: "/download" },
];

const RESOURCE_LINKS = [
  { label: "Help centre", href: "/help" },
  { label: "Blog", href: "/blog" },
  { label: "Free tools", href: "/tools" },
  { label: "43B(h) calculator", href: "/tools/msme-45-day-payment-calculator" },
  { label: "DSO calculator", href: "/tools/dso-calculator" },
];

const INDUSTRY_LINKS = [
  { label: "Adhesives & chemicals", href: "/industries/adhesives-chemicals" },
  { label: "Paints & coatings", href: "/industries/paints" },
  { label: "Pipes & fittings", href: "/industries/pipes-fittings" },
  { label: "Electrical goods", href: "/industries/electrical" },
  { label: "FMCG distribution", href: "/industries/fmcg-distribution" },
];

const COMPANY_LINKS = [
  { label: "Contact", href: "/contact" },
  { label: "Sign in", href: "/login" },
  { label: "Start free trial", href: "/signup" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Refund policy", href: "/refund-policy" },
  { label: "Delete account", href: "/delete-account" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="py-14 border-t"
      style={{ backgroundColor: "#111113", borderColor: "#2A2A2E" }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid gap-10 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-10">
          <div className="max-w-xs col-span-2 md:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-mono text-sm font-bold"
                style={{ backgroundColor: mkt.teal }}
              >
                ₹
              </div>
              <span className="font-display font-semibold text-lg text-white">
                Syncit
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#A1A1AA" }}>
              Order-to-cash for Indian manufacturers and distributors who
              sell on credit.
            </p>
            <p className="mt-4 text-xs" style={{ color: "#8B8B94" }}>
              Made in Pune
            </p>
          </div>

          <FooterCol title="Product" links={PRODUCT_LINKS} />
          <FooterCol title="Resources" links={RESOURCE_LINKS} />
          <FooterCol title="Industries" links={INDUSTRY_LINKS} />
          <FooterCol title="Company" links={COMPANY_LINKS} />
          <FooterCol title="Legal" links={LEGAL_LINKS} />
        </div>

        <div
          className="pt-6 border-t flex flex-col sm:flex-row justify-between gap-3"
          style={{ borderColor: "#2A2A2E" }}
        >
          <p className="text-xs" style={{ color: "#8B8B94" }}>
            © {year} Syncit. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: "#8B8B94" }}>
            grievance@getsyncit.app · support@getsyncit.app
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3
        className="text-[10px] uppercase tracking-widest font-medium mb-4"
        style={{ color: "#8B8B94" }}
      >
        {title}
      </h3>
      <ul className="space-y-2.5">
        {links.map(({ label, href }) => (
          <li key={label}>
            <Link
              href={href}
              className="text-sm transition-colors hover:text-white"
              style={{ color: "#A1A1AA" }}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
