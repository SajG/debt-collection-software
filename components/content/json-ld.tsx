// Structured data for search engines. A JSON data block, not a script
// that runs, so it needs no CSP nonce. "<" is escaped so content can
// never close the tag.
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

const SITE = "https://getsyncit.app";

export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE}${t.path}`,
    })),
  };
}

export function articleLd(a: {
  path: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    datePublished: a.datePublished,
    dateModified: a.dateModified ?? a.datePublished,
    mainEntityOfPage: `${SITE}${a.path}`,
    author: { "@type": "Organization", name: "Syncit", url: SITE },
    publisher: {
      "@type": "Organization",
      name: "Syncit",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/apple-icon.png` },
    },
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
