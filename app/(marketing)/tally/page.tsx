import type { Metadata } from "next";
import Link from "next/link";
import { Download, ArrowRight } from "lucide-react";
import { SiteShell, Section, H2 } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";

export const metadata: Metadata = {
  title: "Tally live sync — Syncit",
  description:
    "How the Syncit Tally connector works: a Windows agent alongside Tally reads customers, invoices and payments every 5 minutes and pushes deltas to Syncit.",
  alternates: { canonical: "https://getsyncit.app/tally" },
};

const STEPS = [
  {
    n: "01",
    title: "Install the connector on the Tally machine",
    body: "One-time install on the Windows PC that runs Tally. It runs as a background service; no need to keep a browser open.",
  },
  {
    n: "02",
    title: "Enter your pairing code from Syncit",
    body: "In Syncit, go to Settings → Tally and copy the pairing code. Paste it into the connector once — that's the entire auth.",
  },
  {
    n: "03",
    title: "Connector talks to Syncit, not the other way round",
    body: "The agent polls Tally locally and pushes deltas over HTTPS. Nothing about your database is exposed to the public internet.",
  },
  {
    n: "04",
    title: "New invoices appear in Syncit within minutes",
    body: "Once running, every new invoice / voucher / receipt shows up in Syncit. Payments recorded in Syncit can optionally sync back.",
  },
];

const FAQ = [
  {
    q: "Which Tally versions are supported?",
    a: "Tally.ERP 9 release 6.6+, Tally Prime, and Tally Prime Server. Tested on Windows 10 and Windows 11.",
  },
  {
    q: "Does it need Tally running all the time?",
    a: "Yes — the connector reads from a live Tally session. On the machine hosting Tally, that's the normal state anyway.",
  },
  {
    q: "Is Tally sync read-only?",
    a: "Read-only by default. Writeback (posting payments from Syncit back to Tally) is opt-in and requires a second confirmation per company.",
  },
  {
    q: "What happens if the PC goes offline?",
    a: "The connector buffers deltas locally. When the machine reconnects, everything catches up automatically.",
  },
];

export default function TallyPage() {
  return (
    <SiteShell>
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: mkt.teal }}>
          Tally live sync
        </p>
        <H2>Your ledger, live in Syncit</H2>
        <p className="text-lg mb-10 max-w-2xl" style={{ color: mkt.ink2 }}>
          A tiny Windows agent runs alongside Tally. It reads customers,
          invoices and payments every 5 minutes and pushes the deltas to
          Syncit. No API keys, no double-entry.
        </p>

        <div className="flex flex-wrap gap-3 mb-14">
          <Link
            href="/download#tally"
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: mkt.teal }}
          >
            <Download size={15} />
            Download the connector
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl border"
            style={{ color: mkt.ink, borderColor: mkt.border, backgroundColor: mkt.white }}
          >
            Start free trial
            <ArrowRight size={15} />
          </Link>
        </div>

        <h3 className="font-display font-bold text-2xl mb-6" style={{ color: mkt.ink }}>
          Four-step setup
        </h3>
        <ol className="space-y-4 mb-14">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-2xl p-6 border flex gap-4"
              style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
            >
              <span className="font-mono font-bold text-sm" style={{ color: mkt.teal }}>
                {s.n}
              </span>
              <div>
                <h4 className="font-semibold text-base mb-1.5" style={{ color: mkt.ink }}>
                  {s.title}
                </h4>
                <p className="text-sm leading-relaxed" style={{ color: mkt.ink2 }}>
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="font-display font-bold text-2xl mb-6" style={{ color: mkt.ink }}>
          Common questions
        </h3>
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <details
              key={q}
              className="rounded-2xl border px-5 py-4"
              style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
            >
              <summary className="cursor-pointer text-sm font-semibold" style={{ color: mkt.ink }}>
                {q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: mkt.ink2 }}>
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
