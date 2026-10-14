import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { JsonLd, breadcrumbLd, faqLd } from "@/components/content/json-ld";

// Shared frame for the free tools: heading, the tool itself, an
// explanation, FAQ (also emitted as FAQPage JSON-LD) and links to the
// related pages.

export type ToolFaq = { q: string; a: string };

export function ToolPage({
  path,
  name,
  eyebrow = "Free tool",
  title,
  intro,
  children,
  explainer,
  faq,
  related,
}: {
  path: string;
  name: string;
  eyebrow?: string;
  title: string;
  intro: string;
  children: React.ReactNode;
  explainer: React.ReactNode;
  faq: ToolFaq[];
  related: { href: string; label: string }[];
}) {
  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Tools", path: "/tools" },
            { name, path },
          ]),
          faqLd(faq),
        ]}
      />
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: mkt.teal }}>
          {eyebrow}
        </p>
        <h1 className="font-display font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)", lineHeight: 1.15 }}>
          {title}
        </h1>
        <p className="text-lg mb-8" style={{ color: mkt.ink2 }}>
          {intro}
        </p>

        <div className="rounded-2xl border bg-white p-5 sm:p-7" style={{ borderColor: mkt.border }}>
          {children}
        </div>

        <div className="mt-12 space-y-4 text-[17px] leading-relaxed" style={{ color: mkt.ink2 }}>
          {explainer}
        </div>

        <section className="mt-12">
          <h2 className="font-display font-bold text-2xl mb-4" style={{ color: mkt.ink }}>
            Questions
          </h2>
          <dl className="space-y-5">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-[17px]" style={{ color: mkt.ink }}>
                  {f.q}
                </dt>
                <dd className="mt-1 text-[17px] leading-relaxed" style={{ color: mkt.ink2 }}>
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 rounded-2xl p-6" style={{ backgroundColor: mkt.tealLight }}>
          <h2 className="font-display font-bold text-xl mb-3" style={{ color: mkt.ink }}>
            Related
          </h2>
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="underline underline-offset-4 text-base" style={{ color: mkt.teal }}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SiteShell>
  );
}

export const toolH2 = "font-display font-bold text-2xl pt-4";
