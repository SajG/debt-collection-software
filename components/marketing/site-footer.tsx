import Link from "next/link";
import { Logo } from "./logo";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/#pricing" },
      { label: "FAQ", href: "/#faq" },
      { label: "Get started", href: "/signup" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Sign up", href: "/signup" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Refund Policy", href: "/refund-policy" },
      { label: "Cancellation Policy", href: "/cancellation-policy" },
      { label: "Data Policy", href: "/data-policy" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="py-14 border-t"
      style={{ backgroundColor: "#111113", borderColor: "#2A2A2E" }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="mb-4">
              <Logo variant="light" />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#71717A" }}>
              Accounts receivable for Indian MSME distributors and manufacturers
              who sell on credit.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-14 gap-y-10 sm:gap-x-20">
            {columns.map(({ heading, links }) => (
              <div key={heading}>
                <h4
                  className="text-[10px] uppercase tracking-widest font-medium mb-4"
                  style={{ color: "#52525B" }}
                >
                  {heading}
                </h4>
                <ul className="space-y-2.5">
                  {links.map(({ label, href }) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="text-sm transition-colors hover:text-white"
                        style={{ color: "#71717A" }}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div
          className="pt-6 border-t flex flex-col sm:flex-row justify-between gap-3"
          style={{ borderColor: "#2A2A2E" }}
        >
          <p className="text-xs" style={{ color: "#52525B" }}>
            © {year} PayTrack. All rights reserved. ·{" "}
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>{" "}
            ·{" "}
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>{" "}
            ·{" "}
            <Link
              href="/data-policy"
              className="hover:text-white transition-colors"
            >
              Data deletion
            </Link>
          </p>
          <p className="text-xs" style={{ color: "#52525B" }}>
            Each customer deployment is fully isolated. No shared data.
          </p>
        </div>
      </div>
    </footer>
  );
}
