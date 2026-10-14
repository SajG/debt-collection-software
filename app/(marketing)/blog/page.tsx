import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { JsonLd, breadcrumbLd } from "@/components/content/json-ld";
import { listDocs } from "@/lib/content";

// SY38 — blog index. Posts are MDX files in content/blog; add a file to
// publish.

export const metadata: Metadata = {
  title: "Blog — Syncit",
  description:
    "Practical notes on Tally outstanding, payment follow-up, credit discipline and the MSME 45-day rule for Indian manufacturers and distributors.",
  alternates: { canonical: "https://getsyncit.app/blog" },
};

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
  const posts = listDocs("blog");
  return (
    <SiteShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: mkt.teal }}>
          Blog
        </p>
        <h1 className="font-display font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          Getting paid, on time, without the chase
        </h1>
        <p className="text-lg mb-10" style={{ color: mkt.ink2 }}>
          Practical notes for manufacturers and distributors who sell on credit.
        </p>
        <ul className="space-y-5">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="block rounded-2xl border bg-white p-6 transition-shadow hover:shadow-sm"
                style={{ borderColor: mkt.border }}
              >
                <h2 className="font-display font-bold text-xl mb-2" style={{ color: mkt.ink }}>
                  {p.title}
                </h2>
                <p className="text-base leading-relaxed mb-3" style={{ color: mkt.ink2 }}>
                  {p.description}
                </p>
                <p className="text-sm" style={{ color: mkt.ink2 }}>
                  {p.date ? longDate(p.date) : ""} · {p.minutes} min read
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </SiteShell>
  );
}
