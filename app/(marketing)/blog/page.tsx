import type { Metadata } from "next";
import { SiteShell, H2 } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";

// SY26 — blog index stub. Real posts land here when we write them.
// Kept as a stub (not a dynamic route) so the sidebar's "Blog" link
// resolves and doesn't 404.

export const metadata: Metadata = {
  title: "Blog — Syncit",
  description:
    "Notes on order-to-cash, credit discipline, and the boring parts of running a distribution business well.",
  alternates: { canonical: "https://getsyncit.app/blog" },
};

export default function BlogIndexPage() {
  return (
    <SiteShell>
      <div className="max-w-2xl mx-auto px-5 sm:px-8">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: mkt.teal }}
        >
          Blog
        </p>
        <H2>Coming soon</H2>
        <p className="text-lg mb-6" style={{ color: mkt.ink2 }}>
          Notes on order-to-cash, credit discipline, and the boring parts of
          running a distribution business well. First posts land in the next
          few weeks.
        </p>
        <p className="text-sm" style={{ color: mkt.ink3 }}>
          Have a topic you&apos;d want to read about? Reply on our
          WhatsApp — the link is in the footer.
        </p>
      </div>
    </SiteShell>
  );
}
