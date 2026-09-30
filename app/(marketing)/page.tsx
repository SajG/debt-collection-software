import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Shield,
  Phone,
  MessageSquare,
  AlertTriangle,
  Clock,
  Database,
  Zap,
  FileText,
  BarChart3,
  Truck,
  Users,
  Factory as FactoryIcon,
  Smartphone,
  Bell,
  Lock,
} from "lucide-react";
import { mkt } from "@/components/marketing/tokens";
import { SiteShell, Section } from "@/components/marketing/site-shell";
import { DashboardMockup } from "@/components/marketing/dashboard-mockup";
import { PLANS, priceLabel, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Syncit — Order-to-cash for Indian manufacturers & distributors",
  description:
    "Syncit is the order-to-cash app for Indian manufacturers and distributors who sell on credit. Every order, dispatch and payment in one app — for sales, factory and management. Get paid faster, without chasing.",
  alternates: { canonical: "https://getsyncit.app/" },
  openGraph: {
    title: "Syncit — Order-to-cash for Indian manufacturers & distributors",
    description:
      "Every order, dispatch and payment in one app — for sales, factory and management.",
    url: "https://getsyncit.app/",
    siteName: "Syncit",
    locale: "en_IN",
    type: "website",
  },
};

// Book-a-demo target. Placeholder number until sales rota is decided.
const DEMO_WA_URL =
  "https://wa.me/919999999999?text=" +
  encodeURIComponent(
    "Hi Syncit team, I'd like to book a demo for my business.",
  );

export default function HomePage() {
  return (
    <>
      <JsonLd />
      <SiteShell padded={false}>
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <FeaturesByRoleSection />
        <TallyBand />
        <ReduceOutstandingBand />
        <SecurityBand />
        <PricingPreview />
        <FAQ />
        <FinalCTA />
      </SiteShell>
    </>
  );
}

function HeroSection() {
  return (
    <section className="relative pt-14 pb-20 sm:pt-20 sm:pb-28 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${mkt.border} 1.5px, transparent 1.5px)`,
          backgroundSize: "28px 28px",
          opacity: 0.6,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-32 pointer-events-none"
        style={{ background: `linear-gradient(to bottom, ${mkt.bg}, transparent)` }}
      />

      <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-14 lg:gap-12">
          <div className="flex-1 max-w-[560px]">
            <div
              className="pt-fade-up inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-7"
              style={{ backgroundColor: mkt.tealLight, color: mkt.teal }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mkt.teal }} />
              Order-to-cash for MSME distributors
            </div>

            <h1
              className="pt-fade-up font-display font-bold leading-[1.08] mb-6"
              style={{
                fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
                color: mkt.ink,
                animationDelay: "0.08s",
              }}
            >
              Every order, dispatch and payment{" "}
              <span style={{ color: mkt.teal }}>in one app</span>.
            </h1>

            <p
              className="pt-fade-up text-lg leading-relaxed mb-8"
              style={{ color: mkt.ink2, animationDelay: "0.18s" }}
            >
              Syncit is the order-to-cash app for Indian manufacturers and
              distributors who sell on credit. Sales, factory and management
              stop working from spreadsheets and WhatsApp threads — and start
              working from the same live view.
            </p>

            <div
              className="pt-fade-up flex flex-wrap gap-3 mb-6"
              style={{ animationDelay: "0.28s" }}
            >
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: mkt.teal }}
              >
                Start free trial
                <ArrowRight size={15} />
              </Link>
              <a
                href={DEMO_WA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl border bg-white transition-colors hover:border-[#C5BBB0]"
                style={{ color: mkt.ink, borderColor: mkt.border }}
              >
                Book a demo on WhatsApp
              </a>
            </div>

            <p
              className="pt-fade-up text-sm"
              style={{ color: mkt.ink3, animationDelay: "0.35s" }}
            >
              {TRIAL_DAYS} days free · No credit card · Works with Tally, Zoho
              Books, Excel
            </p>
          </div>

          <div
            className="pt-slide-in flex-1 lg:max-w-[460px] w-full"
            style={{ animationDelay: "0.15s" }}
          >
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const pains = [
    {
      icon: MessageSquare,
      title: "Orders on WhatsApp",
      body: "Your sales team places orders across 12 WhatsApp threads. Factory copies them into a notebook. Something always gets missed.",
      figure: "₹85,000",
      figureLabel: "Average value of a missed / mistyped order",
    },
    {
      icon: Phone,
      title: "Dispatch on phone calls",
      body: "Salesperson calls factory. Factory calls back. Nobody knows what shipped, what is stuck, or when the LR was generated — until the customer asks.",
      figure: "3–4 hours",
      figureLabel: "Lost to status calls every week",
    },
    {
      icon: AlertTriangle,
      title: "Payments chased from memory",
      body: "Recovery lives in the head of whoever chased last time. No history, no next-follow-up date, no way to know who broke a promise.",
      figure: "60+ days",
      figureLabel: "Typical DSO before Syncit",
    },
  ];

  return (
    <Section bg="bgAlt">
      <div className="text-center mb-12">
        <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
          Money is stuck in outstanding
        </h2>
        <p className="text-lg" style={{ color: mkt.ink2 }}>
          Orders on WhatsApp, dispatch on phone calls, payments chased from
          memory. Nobody sees the shape of it until the month closes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {pains.map(({ icon: Icon, title, body, figure, figureLabel }) => (
          <div
            key={title}
            className="rounded-2xl p-7 border"
            style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
              style={{ backgroundColor: mkt.tealLight, color: mkt.teal }}
            >
              <Icon size={18} />
            </div>
            <h3 className="font-display font-semibold text-lg mb-2" style={{ color: mkt.ink }}>
              {title}
            </h3>
            <p className="text-sm leading-relaxed mb-4" style={{ color: mkt.ink2 }}>
              {body}
            </p>
            <div className="pt-3 border-t" style={{ borderColor: mkt.border }}>
              <div className="font-mono font-bold text-xl" style={{ color: mkt.amber }}>
                {figure}
              </div>
              <div className="text-xs mt-0.5" style={{ color: mkt.ink3 }}>
                {figureLabel}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function HowItWorksSection() {
  const steps = [
    { num: "01", icon: FileText, title: "Order", body: "Sales places an order from the mobile app — customer, items, terms." },
    { num: "02", icon: FactoryIcon, title: "Make", body: "Factory sees it the moment it lands. Advances through in-production → ready." },
    { num: "03", icon: Truck, title: "Dispatch", body: "Factory records LR + qty, uploads LR photo. Salesperson gets a notification." },
    { num: "04", icon: FileText, title: "Invoice", body: "Invoice generated from the order, synced back to Tally / Zoho automatically." },
    { num: "05", icon: BarChart3, title: "Get paid", body: "Reminders before due date. UPI links inside the reminder. Promises tracked." },
  ];

  return (
    <Section id="how-it-works">
      <div className="text-center mb-12">
        <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
          One flow, five steps
        </h2>
        <p className="text-lg max-w-xl mx-auto" style={{ color: mkt.ink2 }}>
          Same rails as your business. Every step drops into the next automatically — no re-entry.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map(({ num, icon: Icon, title, body }) => (
          <div key={num} className="flex flex-col">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: mkt.teal, color: "#FFFFFF" }}
            >
              <Icon size={20} />
            </div>
            <div className="text-xs font-mono font-medium mb-2" style={{ color: mkt.ink3 }}>
              {num}
            </div>
            <h3 className="font-display font-semibold mb-2" style={{ fontSize: "1.05rem", color: mkt.ink }}>
              {title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: mkt.ink2 }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FeaturesByRoleSection() {
  const cols: {
    role: string;
    icon: typeof Users;
    tint: string;
    tintBg: string;
    items: string[];
  }[] = [
    {
      role: "Management",
      icon: BarChart3,
      tint: mkt.teal,
      tintBg: mkt.tealLight,
      items: [
        "Live dashboard — outstanding, DSO, collected this month, overdue",
        "Approvals queue for orders and rate exceptions",
        "Sales-team leaderboard and daily chase list",
        "Credit-limit alerts + real-time device sign-out",
      ],
    },
    {
      role: "Sales",
      icon: Smartphone,
      tint: mkt.amber,
      tintBg: mkt.amberLight,
      items: [
        "Today's call list — ranked by amount × days overdue",
        "One-tap WhatsApp reminder with pre-filled polite message + UPI link",
        "Place orders on the phone in under 60 seconds",
        "Record payments with a photo — bank slip or UPI screenshot",
      ],
    },
    {
      role: "Factory",
      icon: FactoryIcon,
      tint: mkt.ink,
      tintBg: mkt.bgAlt,
      items: [
        "Big-thumb tabs: To produce · Ready to dispatch · Dispatched today",
        "One primary button per card for the next status",
        "LR / invoice upload in-app, no separate courier chat",
        "Works offline; syncs when signal returns",
      ],
    },
  ];

  return (
    <Section bg="bgAlt">
      <div className="text-center mb-12">
        <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
          Built for the three people who move the business
        </h2>
        <p className="text-lg max-w-xl mx-auto" style={{ color: mkt.ink2 }}>
          One codebase, three homes. Everyone sees the parts of the pipeline they own.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {cols.map(({ role, icon: Icon, tint, tintBg, items }) => (
          <div
            key={role}
            className="rounded-2xl p-7 border"
            style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: tintBg, color: tint }}
            >
              <Icon size={20} />
            </div>
            <h3 className="font-display font-bold text-xl mb-4" style={{ color: mkt.ink }}>
              {role}
            </h3>
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm" style={{ color: mkt.ink2 }}>
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: tint }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TallyBand() {
  return (
    <Section>
      <div className="grid gap-8 md:grid-cols-2 md:items-center">
        <div>
          <div
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-5"
            style={{ backgroundColor: mkt.tealLight, color: mkt.teal }}
          >
            <Database size={12} /> Tally live sync
          </div>
          <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
            Your ledger is the source of truth. Syncit just makes it usable.
          </h2>
          <p className="text-base leading-relaxed mb-6" style={{ color: mkt.ink2 }}>
            A tiny Windows agent runs alongside Tally. It reads customers,
            invoices and payments every 5 minutes and pushes the deltas into
            Syncit. New invoices from Tally appear in the dashboard within
            minutes. Payments Sales records inside Syncit go back to Tally
            the same way — no double-entry.
          </p>
          <Link
            href="/tally"
            className="inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: mkt.teal }}
          >
            How the connector works →
          </Link>
        </div>
        <ul className="space-y-3">
          {[
            "Read-only from Tally by default — you turn on writeback",
            "Runs behind your firewall; no direct DB exposure",
            "Handles Tally / Tally Prime / Tally Prime Server",
            "Works with Zoho Books, QuickBooks, Xero too",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3 text-sm" style={{ color: mkt.ink2 }}>
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: mkt.teal }} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function ReduceOutstandingBand() {
  const items = [
    { icon: Bell, title: "Reminders before due date", body: "Polite WhatsApp / email nudge 3 days before due. Not marketing — a real utility template." },
    { icon: Zap, title: "UPI links in every reminder", body: "Razorpay-powered link inside the message. Customer taps, pays, and Syncit records it." },
    { icon: Clock, title: "Promise-to-pay tracking", body: "Record when a customer promises. If they miss, Syncit surfaces them at the top of tomorrow's list." },
    { icon: Users, title: "Daily chase list", body: "Sales opens the app and sees exactly who to call today, ranked by amount × days overdue." },
    { icon: AlertTriangle, title: "Credit-limit alerts", body: "A new order that would push a customer over limit pauses for approval before it hits the factory." },
    { icon: BarChart3, title: "DSO you can trust", body: "One live number the whole business agrees on. Track it week by week." },
  ];

  return (
    <Section bg="bgAlt">
      <div className="text-center mb-12">
        <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
          Get paid faster, without chasing
        </h2>
        <p className="text-lg max-w-xl mx-auto" style={{ color: mkt.ink2 }}>
          Six things the app does every day so you don&apos;t have to.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl p-6 border"
            style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ backgroundColor: mkt.tealLight, color: mkt.teal }}
            >
              <Icon size={16} />
            </div>
            <h3 className="font-display font-semibold mb-1.5" style={{ fontSize: "1rem", color: mkt.ink }}>
              {title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: mkt.ink2 }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SecurityBand() {
  const claims = [
    { icon: Lock, title: "Data encrypted", body: "In transit on TLS, at rest on Supabase Postgres. Per-tenant secrets encrypted with AES-256-GCM." },
    { icon: Shield, title: "Role-based access", body: "Management / Sales / Factory each see only what they need. Enforced at the database, not just the UI." },
    { icon: Smartphone, title: "Revoke a device instantly", body: "A lost phone signs out on your next tap in Admin → Devices. The old device sees nothing." },
    { icon: Database, title: "India region", body: "Data hosted in AWS Mumbai (ap-south-1) via Supabase. Business customers can request in-writing residency." },
  ];

  return (
    <Section bg="dark">
      <div className="text-center mb-12">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
        >
          <Shield size={26} className="text-white" />
        </div>
        <h2 className="font-display font-bold leading-tight mb-5" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)" }}>
          Built with the boring parts of security done first
        </h2>
        <p
          className="text-lg max-w-2xl mx-auto leading-relaxed"
          style={{ color: "rgba(255,255,255,0.72)" }}
        >
          No marketing claims — only things you can inspect and revoke.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {claims.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: "rgba(255,255,255,0.07)",
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Icon size={20} className="mb-3" style={{ color: "rgba(255,255,255,0.75)" }} />
            <h3 className="font-semibold text-white mb-2 text-sm">{title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function PricingPreview() {
  return (
    <Section id="pricing">
      <div className="text-center mb-12">
        <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
          Simple, predictable pricing
        </h2>
        <p className="text-lg" style={{ color: mkt.ink2 }}>
          Three plans. No percentage on amounts recovered. Prices exclude GST.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="rounded-2xl p-6 border flex flex-col"
            style={{
              backgroundColor: mkt.white,
              borderColor: plan.highlight ? mkt.teal : mkt.border,
              borderWidth: plan.highlight ? 2 : 1,
            }}
          >
            {plan.highlight && (
              <span
                className="self-start rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide mb-3"
                style={{ backgroundColor: mkt.tealLight, color: mkt.teal }}
              >
                Most popular
              </span>
            )}
            <h3 className="font-display font-bold text-xl mb-1" style={{ color: mkt.ink }}>
              {plan.name}
            </h3>
            <p className="text-sm mb-4" style={{ color: mkt.ink2 }}>
              {plan.tagline}
            </p>
            <div className="mb-4">
              <span className="font-mono font-bold text-2xl" style={{ color: mkt.ink }}>
                {priceLabel(plan, "monthly")}
              </span>
              {plan.monthlyINR !== null && (
                <span className="text-xs ml-1.5" style={{ color: mkt.ink3 }}>
                  + GST
                </span>
              )}
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.slice(0, 4).map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm" style={{ color: mkt.ink2 }}>
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: mkt.teal }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={plan.ctaHref}
              className="w-full text-center rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                backgroundColor: plan.highlight ? mkt.teal : mkt.white,
                color: plan.highlight ? "#FFFFFF" : mkt.teal,
                border: plan.highlight ? "none" : `1px solid ${mkt.teal}`,
              }}
            >
              {plan.ctaLabel}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-sm" style={{ color: mkt.ink3 }}>
        Annual = 2 months free · {TRIAL_DAYS}-day free trial · No card
        required ·{" "}
        <Link href="/pricing" className="underline underline-offset-4" style={{ color: mkt.teal }}>
          Compare all features →
        </Link>
      </p>
    </Section>
  );
}

function FAQ() {
  const items = [
    { q: "Do I need to change my accounting software?", a: "No. Syncit sits alongside Tally, Zoho Books, QuickBooks, or Xero. If you're on Excel today, we import it — no change needed." },
    { q: "Do I need to keep our WhatsApp workflow?", a: "You can, and most customers do for the first month. Sales gradually moves order-placement to Syncit; reminders start going out via Syncit's WhatsApp template. WhatsApp threads live on for chat." },
    { q: "How is this different from a CRM?", a: "A CRM tracks people. Syncit tracks orders, dispatches, invoices and payments — the actual money. Everything is anchored to your ledger." },
    { q: "What happens if I cancel?", a: "Your data is yours. Export everything as CSV any time; on cancel we keep the workspace read-only for 30 days, then delete on request." },
    { q: "Do you support other regions than India?", a: "The billing side (Razorpay, GST) is India-first. The core app works elsewhere; talk to us for a plan." },
  ];
  return (
    <Section narrow>
      <h2 className="font-display font-bold mb-8 text-center" style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)" }}>
        Frequently asked questions
      </h2>
      <div className="space-y-3">
        {items.map(({ q, a }) => (
          <details
            key={q}
            className="group rounded-2xl border px-5 py-4"
            style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
          >
            <summary
              className="cursor-pointer text-sm font-semibold flex items-center justify-between gap-4"
              style={{ color: mkt.ink }}
            >
              <span>{q}</span>
              <span className="text-xs font-mono" style={{ color: mkt.ink3 }}>+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: mkt.ink2 }}>
              {a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function FinalCTA() {
  return (
    <Section>
      <div
        className="rounded-3xl border p-10 sm:p-14 text-center"
        style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
      >
        <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)" }}>
          Ready to see it with your own data?
        </h2>
        <p className="text-base max-w-xl mx-auto mb-8" style={{ color: mkt.ink2 }}>
          {TRIAL_DAYS}-day free trial. No credit card. Import your customers
          from Tally or Excel and start today.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: mkt.teal }}
          >
            Start free trial
            <ArrowRight size={15} />
          </Link>
          <a
            href={DEMO_WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl border transition-colors"
            style={{ color: mkt.ink, borderColor: mkt.border }}
          >
            Book a demo on WhatsApp
          </a>
        </div>
      </div>
    </Section>
  );
}

function JsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Syncit",
        url: "https://getsyncit.app",
        logo: "https://getsyncit.app/opengraph-image",
        contactPoint: [
          {
            "@type": "ContactPoint",
            email: "support@getsyncit.app",
            contactType: "customer support",
            areaServed: "IN",
          },
          {
            "@type": "ContactPoint",
            email: "grievance@getsyncit.app",
            contactType: "grievance officer",
            areaServed: "IN",
          },
        ],
        sameAs: [] as string[],
      },
      {
        "@type": "SoftwareApplication",
        name: "Syncit",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android, Windows (Tally connector)",
        offers: PLANS.filter((p) => p.monthlyINR !== null).map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: p.monthlyINR,
          priceCurrency: "INR",
          url: `https://getsyncit.app/pricing#${p.id}`,
        })),
        description:
          "Order-to-cash app for Indian manufacturers and distributors who sell on credit. Every order, dispatch and payment in one app for sales, factory and management.",
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
