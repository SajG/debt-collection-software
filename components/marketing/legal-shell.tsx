import type { ReactNode } from "react";
import { SiteNav } from "./site-nav";
import { SiteFooter } from "./site-footer";
import { C } from "./tokens";

// Shared layout for legal pages: same nav/footer/palette as the marketing
// homepage, with a readable article column and consistent typography.
export function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-x-hidden"
      style={{ backgroundColor: C.bg, color: C.ink, fontFamily: "var(--font-body)" }}
    >
      <SiteNav />
      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <h1
          className="font-display font-bold leading-tight mb-3"
          style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", color: C.ink }}
        >
          {title}
        </h1>
        <p className="text-sm mb-12" style={{ color: C.ink3 }}>
          Last updated: {lastUpdated}
        </p>
        <article className="legal-prose">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}
