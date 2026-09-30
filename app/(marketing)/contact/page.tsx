import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";
import { SiteShell, H2 } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";

export const metadata: Metadata = {
  title: "Contact — Syncit",
  description:
    "Talk to Syncit — sales, support, grievance officer, and address.",
  alternates: { canonical: "https://getsyncit.app/contact" },
};

const DEMO_WA_URL =
  "https://wa.me/919999999999?text=" +
  encodeURIComponent("Hi Syncit team, I'd like to talk about my business.");

export default function ContactPage() {
  return (
    <SiteShell>
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: mkt.teal }}
        >
          Contact
        </p>
        <H2>Talk to us</H2>
        <p className="text-lg mb-10" style={{ color: mkt.ink2 }}>
          Fastest is WhatsApp — we answer inside business hours (IST). Email
          works for anything that needs a paper trail.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          <Card
            icon={MessageSquare}
            title="WhatsApp us"
            body="For sales, demos, quick setup help."
            cta="Open WhatsApp"
            ctaHref={DEMO_WA_URL}
          />
          <Card
            icon={Mail}
            title="Email support"
            body="For bugs, invoices, account changes."
            cta="support@getsyncit.app"
            ctaHref="mailto:support@getsyncit.app"
          />
        </div>

        <div
          className="rounded-2xl p-6 border mb-8"
          style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
        >
          <h3 className="font-display font-bold text-lg mb-3" style={{ color: mkt.ink }}>
            Grievance officer
          </h3>
          <p className="text-sm mb-2" style={{ color: mkt.ink2 }}>
            As required under the Information Technology Rules, 2021 and the
            Digital Personal Data Protection Act, 2023.
          </p>
          <ul className="text-sm space-y-1" style={{ color: mkt.ink }}>
            <li>
              <strong>Name:</strong> [To be appointed — see legal draft comment]
            </li>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:grievance@getsyncit.app" className="underline" style={{ color: mkt.teal }}>
                grievance@getsyncit.app
              </a>
            </li>
            <li>
              <strong>Response SLA:</strong> Acknowledge within 24 hours,
              resolve within 15 days.
            </li>
          </ul>
        </div>

        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
        >
          <h3 className="font-display font-bold text-lg mb-3" style={{ color: mkt.ink }}>
            Company
          </h3>
          <p className="text-sm mb-2" style={{ color: mkt.ink2 }}>
            [Registered legal entity name] — [CIN] — Pune, Maharashtra, India
          </p>
          <p className="text-sm" style={{ color: mkt.ink3 }}>
            Full address and GSTIN available on request from{" "}
            <a href="mailto:support@getsyncit.app" className="underline" style={{ color: mkt.teal }}>
              support@getsyncit.app
            </a>
            .
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white"
            style={{ backgroundColor: mkt.teal }}
          >
            Start free trial instead
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}

function Card({
  icon: Icon,
  title,
  body,
  cta,
  ctaHref,
}: {
  icon: typeof MessageSquare;
  title: string;
  body: string;
  cta: string;
  ctaHref: string;
}) {
  return (
    <a
      href={ctaHref}
      target={ctaHref.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="rounded-2xl p-6 border block transition-shadow hover:shadow-md"
      style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: mkt.tealLight, color: mkt.teal }}
      >
        <Icon size={18} />
      </div>
      <h3 className="font-display font-bold text-lg mb-1" style={{ color: mkt.ink }}>
        {title}
      </h3>
      <p className="text-sm mb-3" style={{ color: mkt.ink2 }}>
        {body}
      </p>
      <span className="text-sm font-semibold" style={{ color: mkt.teal }}>
        {cta} →
      </span>
    </a>
  );
}
