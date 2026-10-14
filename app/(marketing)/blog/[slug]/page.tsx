import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { Mdx } from "@/components/content/mdx";
import { JsonLd, articleLd, breadcrumbLd } from "@/components/content/json-ld";
import { getDoc, listDocs } from "@/lib/content";

export function generateStaticParams() {
  return listDocs("blog").map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getDoc("blog", params.slug);
  if (!post) return {};
  const url = `https://getsyncit.app/blog/${post.slug}`;
  return {
    title: `${post.title} — Syncit`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url,
      siteName: "Syncit",
      locale: "en_IN",
      publishedTime: post.date ?? undefined,
      modifiedTime: post.updated ?? post.date ?? undefined,
    },
  };
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getDoc("blog", params.slug);
  if (!post) notFound();
  const path = `/blog/${post.slug}`;
  const others = listDocs("blog").filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path },
          ]),
          articleLd({
            path,
            title: post.title,
            description: post.description,
            datePublished: post.date ?? "2026-10-09",
            dateModified: post.updated,
          }),
        ]}
      />
      <article className="max-w-2xl mx-auto px-5 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm" style={{ color: mkt.ink2 }}>
          <Link href="/blog" className="underline underline-offset-4" style={{ color: mkt.teal }}>
            Blog
          </Link>
        </nav>
        <h1 className="font-display font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4.2vw, 2.7rem)", lineHeight: 1.15 }}>
          {post.title}
        </h1>
        <p className="text-sm mb-6" style={{ color: mkt.ink2 }}>
          {post.date ? longDate(post.date) : ""} · {post.minutes} min read · {post.author ?? "Syncit team"}
        </p>
        <p className="text-xl leading-relaxed mb-2" style={{ color: mkt.ink2 }}>
          {post.description}
        </p>
        <Mdx source={post.body} />

        <aside className="mt-12 rounded-2xl p-6" style={{ backgroundColor: mkt.tealLight }}>
          <h2 className="font-display font-bold text-xl mb-2">Orders, dispatch and payments in one app</h2>
          <p className="mb-4 text-base" style={{ color: mkt.ink2 }}>
            Syncit shows each salesperson who to follow up with today, and shows you the whole picture.
          </p>
          <Link
            href="/features"
            className="inline-block rounded-xl px-5 py-3 text-base font-semibold text-white"
            style={{ backgroundColor: mkt.teal }}
          >
            See how it works
          </Link>
        </aside>

        {others.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display font-bold text-xl mb-4">Keep reading</h2>
            <ul className="space-y-3">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link href={`/blog/${o.slug}`} className="underline underline-offset-4 text-base" style={{ color: mkt.teal }}>
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </SiteShell>
  );
}
