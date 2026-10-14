import type { Metadata } from "next";
import { SiteShell } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { HelpSearch } from "@/components/content/help-search";
import { WhatsAppSupportButton } from "@/components/content/whatsapp-button";
import { JsonLd, breadcrumbLd } from "@/components/content/json-ld";
import { listDocs } from "@/lib/content";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Help — Syncit",
  description:
    "Step-by-step help for Syncit: sign in, invite your team, connect Tally, place orders, record payments, reminders, plans and more.",
  alternates: { canonical: "https://getsyncit.app/help" },
};

export default function HelpIndexPage() {
  const docs = listDocs("help");
  return (
    <SiteShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Help", path: "/help" }])} />
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: mkt.teal }}>
          Help
        </p>
        <h1 className="font-display font-bold mb-3" style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>
          How can we help?
        </h1>
        <p className="text-lg mb-8" style={{ color: mkt.ink2 }}>
          Short guides for the things people ask us most.
        </p>
        <HelpSearch
          items={docs.map((d) => ({ slug: d.slug, title: d.title, description: d.description, text: d.text }))}
        />
        <div className="mt-12 rounded-2xl border bg-white p-6" style={{ borderColor: mkt.border }}>
          <h2 className="font-display font-bold text-xl mb-2">Still stuck?</h2>
          <p className="mb-4 text-base" style={{ color: mkt.ink2 }}>
            A person replies, 10 am – 7 pm, Monday to Saturday. Or email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline" style={{ color: mkt.teal }}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <WhatsAppSupportButton />
        </div>
      </div>
    </SiteShell>
  );
}
