import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { Mdx } from "@/components/content/mdx";
import { WhatsAppSupportButton } from "@/components/content/whatsapp-button";
import { JsonLd, articleLd, breadcrumbLd } from "@/components/content/json-ld";
import { getDoc, listDocs } from "@/lib/content";

export function generateStaticParams() {
  return listDocs("help").map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const doc = getDoc("help", params.slug);
  if (!doc) return {};
  return {
    title: `${doc.title} — Syncit Help`,
    description: doc.description,
    alternates: { canonical: `https://getsyncit.app/help/${doc.slug}` },
  };
}

export default function HelpArticlePage({ params }: { params: { slug: string } }) {
  const doc = getDoc("help", params.slug);
  if (!doc) notFound();
  const all = listDocs("help");
  const i = all.findIndex((d) => d.slug === doc.slug);
  const next = all[i + 1] ?? null;
  const path = `/help/${doc.slug}`;

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Help", path: "/help" },
            { name: doc.title, path },
          ]),
          articleLd({
            path,
            title: doc.title,
            description: doc.description,
            datePublished: doc.updated ?? "2026-10-09",
            dateModified: doc.updated,
          }),
        ]}
      />
      <article className="max-w-2xl mx-auto px-5 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm" style={{ color: mkt.ink2 }}>
          <Link href="/help" className="underline underline-offset-4" style={{ color: mkt.teal }}>
            Help
          </Link>{" "}
          / {doc.title}
        </nav>
        <h1 className="font-display font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4vw, 2.5rem)" }}>
          {doc.title}
        </h1>
        <p className="text-lg mb-6" style={{ color: mkt.ink2 }}>
          {doc.description}
        </p>
        <Mdx source={doc.body} />

        <div className="mt-12 flex flex-col gap-4 rounded-2xl border bg-white p-6" style={{ borderColor: mkt.border }}>
          <p className="text-base" style={{ color: mkt.ink2 }}>
            Did not find the answer? Ask a person.
          </p>
          <div>
            <WhatsAppSupportButton context={doc.title} />
          </div>
        </div>
        <p className="mt-8 text-base">
          {next ? (
            <>
              Next:{" "}
              <Link href={`/help/${next.slug}`} className="underline underline-offset-4" style={{ color: mkt.teal }}>
                {next.title}
              </Link>
            </>
          ) : (
            <Link href="/help" className="underline underline-offset-4" style={{ color: mkt.teal }}>
              All help articles
            </Link>
          )}
        </p>
      </article>
    </SiteShell>
  );
}
