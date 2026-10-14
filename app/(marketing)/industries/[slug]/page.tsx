import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { JsonLd, breadcrumbLd, faqLd } from "@/components/content/json-ld";
import { INDUSTRIES, getIndustry } from "@/lib/industries";

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const ind = getIndustry(params.slug);
  if (!ind) return {};
  const url = `https://getsyncit.app/industries/${ind.slug}`;
  return {
    title: `${ind.title} — Syncit`,
    description: ind.description,
    alternates: { canonical: url },
    openGraph: { title: ind.title, description: ind.description, url, siteName: "Syncit", locale: "en_IN", type: "website" },
  };
}

export default function IndustryPage({ params }: { params: { slug: string } }) {
  const ind = getIndustry(params.slug);
  if (!ind) notFound();
  const path = `/industries/${ind.slug}`;
  const others = INDUSTRIES.filter((i) => i.slug !== ind.slug);
  const h2 = "font-display font-bold text-2xl mt-12 mb-4";

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: ind.name, path },
          ]),
          faqLd(ind.faq),
        ]}
      />
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: mkt.teal }}>
          {ind.name}
        </p>
        <h1 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.9rem, 4.2vw, 2.7rem)", lineHeight: 1.15 }}>
          {ind.title}
        </h1>
        <p className="text-xl leading-relaxed mb-5" style={{ color: mkt.ink2 }}>
          {ind.intro}
        </p>
        <p className="text-[17px] leading-relaxed" style={{ color: mkt.ink2 }}>
          {ind.day}
        </p>

        <h2 className={h2} style={{ color: mkt.ink }}>
          Where it goes wrong
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ind.pains.map((p) => (
            <li key={p.title} className="rounded-2xl border bg-white p-5" style={{ borderColor: mkt.border }}>
              <h3 className="font-semibold text-[17px] mb-1" style={{ color: mkt.ink }}>
                {p.title}
              </h3>
              <p className="text-base leading-relaxed" style={{ color: mkt.ink2 }}>
                {p.body}
              </p>
            </li>
          ))}
        </ul>

        <h2 className={h2} style={{ color: mkt.ink }}>
          From order to payment
        </h2>
        <ol className="space-y-4">
          {ind.workflow.map((w, i) => (
            <li key={w.step} className="rounded-2xl border bg-white p-5" style={{ borderColor: mkt.border }}>
              <h3 className="font-display font-bold text-lg mb-2" style={{ color: mkt.ink }}>
                {i + 1}. {w.step}
              </h3>
              <p className="text-base leading-relaxed mb-2" style={{ color: mkt.ink2 }}>
                <strong style={{ color: mkt.ink }}>In your trade: </strong>
                {w.trade}
              </p>
              <p className="text-base leading-relaxed" style={{ color: mkt.ink2 }}>
                <strong style={{ color: mkt.teal }}>In Syncit: </strong>
                {w.syncit}
              </p>
            </li>
          ))}
        </ol>

        <h2 className={h2} style={{ color: mkt.ink }}>
          Your words, where they live
        </h2>
        <dl className="rounded-2xl border bg-white px-5" style={{ borderColor: mkt.border }}>
          {ind.terms.map((t) => (
            <div key={t.word} className="border-b py-3 last:border-b-0" style={{ borderColor: mkt.border }}>
              <dt className="font-semibold text-base" style={{ color: mkt.ink }}>
                {t.word}
              </dt>
              <dd className="text-base leading-relaxed" style={{ color: mkt.ink2 }}>
                {t.meaning}
              </dd>
            </div>
          ))}
        </dl>

        <h2 className={h2} style={{ color: mkt.ink }}>
          Questions
        </h2>
        <dl className="space-y-5">
          {ind.faq.map((f) => (
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

        <aside className="mt-12 rounded-2xl p-6" style={{ backgroundColor: mkt.tealLight }}>
          <h2 className="font-display font-bold text-xl mb-2" style={{ color: mkt.ink }}>
            See it with your own customers
          </h2>
          <p className="mb-4 text-base" style={{ color: mkt.ink2 }}>
            Fourteen days, everything included. Bring your customers from Tally or a sheet.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl px-5 py-3 text-base font-semibold text-white" style={{ backgroundColor: mkt.teal }}>
              Start free trial
            </Link>
            <Link href="/pricing" className="rounded-xl border bg-white px-5 py-3 text-base font-semibold" style={{ borderColor: mkt.border, color: mkt.ink }}>
              See pricing
            </Link>
          </div>
        </aside>

        <section className="mt-12">
          <h2 className="font-display font-bold text-xl mb-3" style={{ color: mkt.ink }}>
            Related
          </h2>
          <ul className="space-y-2">
            {ind.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="underline underline-offset-4 text-base" style={{ color: mkt.teal }}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base" style={{ color: mkt.ink2 }}>
            Other industries:{" "}
            {others.map((o, i) => (
              <span key={o.slug}>
                {i > 0 ? " · " : ""}
                <Link href={`/industries/${o.slug}`} className="underline underline-offset-4" style={{ color: mkt.teal }}>
                  {o.name}
                </Link>
              </span>
            ))}
          </p>
        </section>
      </div>
    </SiteShell>
  );
}
