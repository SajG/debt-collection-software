import Link from "next/link";
import { Logo } from "./logo";
import { C } from "./tokens";

export function SiteNav() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: `${C.bg}E8`,
        borderColor: C.border,
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center group">
          <Logo />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: "How it works", href: "/#how-it-works" },
            { label: "Pricing", href: "/#pricing" },
            { label: "FAQ", href: "/#faq" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-sm transition-colors hover:opacity-80"
              style={{ color: C.ink2 }}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:block text-sm transition-colors hover:opacity-70"
            style={{ color: C.ink2 }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.teal }}
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
