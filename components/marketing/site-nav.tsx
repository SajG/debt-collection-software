import Link from "next/link";
import { mkt } from "./tokens";

const NAV = [
  { label: "Features", href: "/features" },
  { label: "Tally", href: "/tally" },
  { label: "Pricing", href: "/pricing" },
] as const;

export function SiteNav() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{ backgroundColor: `${mkt.bg}E8`, borderColor: mkt.border }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-mono text-sm font-bold shrink-0"
            style={{ backgroundColor: mkt.teal }}
          >
            ₹
          </div>
          <span
            className="font-display font-semibold text-lg tracking-tight"
            style={{ color: mkt.ink }}
          >
            Syncit
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm transition-colors hover:opacity-80"
              style={{ color: mkt.ink2 }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:block text-sm transition-colors hover:opacity-70"
            style={{ color: mkt.ink2 }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: mkt.teal }}
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  );
}
