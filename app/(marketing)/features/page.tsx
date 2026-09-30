import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SiteShell, Section, H2 } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";

export const metadata: Metadata = {
  title: "Features — Syncit",
  description:
    "Everything Syncit does: orders, dispatch, invoicing, payments, follow-ups, analytics, Tally sync, mobile + web.",
  alternates: { canonical: "https://getsyncit.app/features" },
};

const FEATURE_GROUPS: {
  title: string;
  intro: string;
  items: { name: string; body: string }[];
}[] = [
  {
    title: "Orders → Dispatch → Invoice",
    intro:
      "One pipeline from a sales rep's phone all the way to the customer's ledger.",
    items: [
      { name: "Mobile order entry", body: "Sales places an order in under 60 seconds: customer picker, item chips, payment terms, delivery date." },
      { name: "Approvals queue", body: "Every STAFF order optionally waits for management to approve. Off-floor rate exceptions surface here too." },
      { name: "Multi-SKU orders", body: "One order, N lines, one order number. Factory ticks each line to READY independently." },
      { name: "Factory tabs", body: "To produce · Ready to dispatch · Dispatched today. One primary button per card." },
      { name: "Dispatch lots + LR", body: "Record part shipments; upload LR photo (multi-page) in the same tap." },
      { name: "Invoice generation", body: "Convert a delivered order into an invoice with GST breakdown; posts back to Tally when connected." },
    ],
  },
  {
    title: "Get paid",
    intro: "Every reminder-worthy customer, ranked automatically.",
    items: [
      { name: "Today's chase list", body: "Ranked by amount × days overdue. Each row = Call, WhatsApp, Record payment." },
      { name: "WhatsApp reminders", body: "Utility-category template. Pre-filled polite message with UPI link. User taps Send." },
      { name: "UPI payment links", body: "Razorpay-generated. Customer pays; webhook flips the invoice to PAID." },
      { name: "Promise-to-pay tracking", body: "Log a promise with a date and amount. Missed promises surface at the top of tomorrow." },
      { name: "Credit-limit gating", body: "New orders that would push a customer over limit pause for approval before the factory sees them." },
      { name: "Escalation ladder", body: "Flagged → Notice → Final notice → Legal. Automatic based on rules; overridable." },
    ],
  },
  {
    title: "Live sync + integrations",
    intro: "Anchor everything to your ledger; Syncit doesn't try to replace it.",
    items: [
      { name: "Tally live sync", body: "5-minute polling from a Windows agent. Read-only by default; opt-in writeback." },
      { name: "Cloud accounting", body: "Zoho Books, QuickBooks, Xero — OAuth-based, per-tenant refresh tokens encrypted." },
      { name: "CSV import", body: "Excel-style rows for parties, invoices, payments. Full column mapping preview + dry-run." },
      { name: "Export everything", body: "One click, CSV or JSON. No lock-in; the data is yours." },
    ],
  },
  {
    title: "Runs everywhere your team does",
    intro: "Native mobile for field users, browser dashboards for the office.",
    items: [
      { name: "iOS + Android app", body: "Same account as web. Works offline; syncs when signal returns." },
      { name: "One-active-device", body: "A lost phone signs out on the next admin tap. The old device sees nothing." },
      { name: "Web dashboard", body: "Command palette, keyboard nav, saved filters in URL." },
      { name: "Hindi + Marathi", body: "Mobile app language picker in Settings. English default; more languages next." },
    ],
  },
  {
    title: "Management view",
    intro: "The three numbers that decide whether it's a good month.",
    items: [
      { name: "Outstanding + DSO", body: "One live dashboard. Drill into any customer in one tap." },
      { name: "Collected this month", body: "Against target if you set one. Per salesperson leaderboard." },
      { name: "Needs-you list", body: "Approvals, rate exceptions, disputes, broken promises — one queue." },
      { name: "Audit log", body: "Who did what, when. Never deletable." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <SiteShell>
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="max-w-2xl mb-12">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: mkt.teal }}
          >
            Features
          </p>
          <H2>Everything the app does</H2>
          <p className="text-lg" style={{ color: mkt.ink2 }}>
            Grouped by the outcome you&apos;re after. If something you need isn&apos;t here,
            we probably plan to build it —{" "}
            <Link href="/contact" className="underline underline-offset-4" style={{ color: mkt.teal }}>
              tell us
            </Link>
            .
          </p>
        </div>

        <div className="space-y-14">
          {FEATURE_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="font-display font-bold text-2xl mb-2" style={{ color: mkt.ink }}>
                {group.title}
              </h3>
              <p className="text-base mb-6" style={{ color: mkt.ink2 }}>
                {group.intro}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-2xl p-5 border"
                    style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 size={16} className="mt-1 shrink-0" style={{ color: mkt.teal }} />
                      <div>
                        <h4 className="font-semibold text-sm mb-1" style={{ color: mkt.ink }}>
                          {item.name}
                        </h4>
                        <p className="text-sm leading-relaxed" style={{ color: mkt.ink2 }}>
                          {item.body}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: mkt.teal }}
          >
            Start free trial
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
