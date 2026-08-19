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
} from "lucide-react";

export const metadata: Metadata = {
  title: "PayTrack — Accounts Receivable for MSME Distributors",
  description:
    "Track outstanding invoices, manage overdue customers, and send follow-ups — without the chaos of WhatsApp threads and phone calls. Built for Indian MSME distributors.",
};

// ─── colour tokens (all as literal strings, no Tailwind arbitrary values in loops) ───
const C = {
  bg: "#F5F2EC",
  bgAlt: "#ECE8DF",
  ink: "#1C1917",
  ink2: "#57534E",
  ink3: "#A8A29E",
  teal: "#0D5C4A",
  tealDark: "#093D30",
  tealLight: "#E8F4F0",
  amber: "#9C6C0A",
  amberLight: "#FEF3C7",
  border: "#DDD8CF",
  white: "#FFFFFF",
  darkBg: "#093D30",
};

export default function HomePage() {
  return (
    <div
      className="overflow-x-hidden"
      style={{ backgroundColor: C.bg, color: C.ink, fontFamily: "var(--font-body)" }}
    >
      <SiteNav />
      <main>
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <TrustSection />
        <PricingSection />
      </main>
      <SiteFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────

function SiteNav() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: `${C.bg}E8`,
        borderColor: C.border,
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-mono text-sm font-bold shrink-0"
            style={{ backgroundColor: C.teal }}
          >
            ₹
          </div>
          <span
            className="font-display font-semibold text-lg tracking-tight"
            style={{ color: C.ink }}
          >
            PayTrack
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: "How it works", href: "#how-it-works" },
            { label: "Pricing", href: "#pricing" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-sm transition-colors hover:opacity-80"
              style={{ color: C.ink2 }}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:block text-sm transition-colors hover:opacity-70"
            style={{ color: C.ink2 }}
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.teal }}
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative pt-14 pb-20 sm:pt-20 sm:pb-28 overflow-hidden">
      {/* Dot-grid — ledger paper feel */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${C.border} 1.5px, transparent 1.5px)`,
          backgroundSize: "28px 28px",
          opacity: 0.6,
        }}
      />
      {/* Top gradient fade */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-32 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${C.bg}, transparent)`,
        }}
      />

      <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-14 lg:gap-12">

          {/* ── Left: copy ── */}
          <div className="flex-1 max-w-[540px]">
            {/* Pill badge */}
            <div
              className="pt-fade-up inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-7"
              style={{ backgroundColor: C.tealLight, color: C.teal }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: C.teal }}
              />
              For MSME distributors &amp; manufacturers
            </div>

            <h1
              className="pt-fade-up font-display font-bold leading-[1.08] mb-6"
              style={{
                fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
                color: C.ink,
                animationDelay: "0.08s",
              }}
            >
              Know who owes you.{" "}
              <span style={{ color: C.teal }}>Follow up</span>{" "}
              without the daily grind.
            </h1>

            <p
              className="pt-fade-up text-lg leading-relaxed mb-8"
              style={{ color: C.ink2, animationDelay: "0.18s" }}
            >
              Stop managing credit sales in Excel and chasing thirty customers
              one WhatsApp at a time. PayTrack shows you exactly who&apos;s
              overdue, drafts your follow-up message, and logs every
              promise — so nothing falls through the cracks.
            </p>

            <div
              className="pt-fade-up flex flex-wrap gap-3 mb-8"
              style={{ animationDelay: "0.28s" }}
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: C.teal }}
              >
                Sign in
                <ArrowRight size={15} />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl border bg-white transition-colors hover:border-[#C5BBB0]"
                style={{ color: C.ink, borderColor: C.border }}
              >
                See how it works
              </a>
            </div>

            <p
              className="pt-fade-up text-sm"
              style={{ color: C.ink3, animationDelay: "0.35s" }}
            >
              Works with Tally, Zoho Books, and Excel exports
            </p>
          </div>

          {/* ── Right: dashboard mockup ── */}
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

function DashboardMockup() {
  const parties = [
    {
      name: "Mehta Trading Co.",
      amount: "2,45,000",
      badge: "38 days overdue",
      badgeColor: C.amber,
      badgeBg: C.amberLight,
    },
    {
      name: "Rajan Steels Pvt.",
      amount: "87,500",
      badge: "Promised 18 Jul",
      badgeColor: C.teal,
      badgeBg: C.tealLight,
    },
    {
      name: "Kapoor Brothers",
      amount: "3,12,000",
      badge: "52 days · Critical",
      badgeColor: "#DC2626",
      badgeBg: "#FEF2F2",
    },
    {
      name: "Gupta Hardware",
      amount: "64,200",
      badge: "Due in 3 days",
      badgeColor: C.ink2,
      badgeBg: "#F4F4F5",
    },
  ];

  return (
    <div
      className="pt-float rounded-2xl overflow-hidden border shadow-2xl"
      style={{ borderColor: C.border, backgroundColor: C.white }}
    >
      {/* Chrome bar */}
      <div
        className="flex items-center gap-1.5 px-4 py-3"
        style={{ backgroundColor: C.teal }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
          />
        ))}
        <span className="ml-auto text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
          PayTrack Dashboard
        </span>
      </div>

      {/* Summary row */}
      <div className="px-5 pt-4 pb-4 border-b" style={{ borderColor: "#F0EDE7" }}>
        <div
          className="text-[10px] uppercase tracking-widest mb-1"
          style={{ color: C.ink3 }}
        >
          Total Outstanding
        </div>
        <div
          className="font-mono font-bold text-[2rem] leading-none"
          style={{ color: C.ink, fontFamily: "var(--font-display)" }}
        >
          ₹14,32,500
        </div>
        <div className="text-xs mt-1" style={{ color: C.ink2 }}>
          23 parties &middot; 47 invoices
        </div>
        {/* Overdue bar */}
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F0EDE7" }}>
          <div
            className="h-full rounded-full"
            style={{ width: "68%", backgroundColor: C.amber }}
          />
        </div>
        <div className="mt-1.5 text-[11px]" style={{ color: C.amber }}>
          68% overdue 30+ days
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 border-b" style={{ borderColor: "#F0EDE7" }}>
        {[
          { label: "Overdue", value: "23", color: C.amber },
          { label: "Promised", value: "8", color: C.teal },
          { label: "Follow-up", value: "12", color: C.ink2 },
        ].map(({ label, value, color }, i) => (
          <div
            key={label}
            className="py-3 text-center"
            style={{
              borderRight: i < 2 ? `1px solid #F0EDE7` : undefined,
            }}
          >
            <div className="font-bold text-lg leading-none" style={{ color }}>
              {value}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: C.ink3 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Party rows */}
      <div>
        {parties.map(({ name, amount, badge, badgeColor, badgeBg }) => (
          <div
            key={name}
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: "#F8F5F0" }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: C.ink }}>
                {name}
              </div>
              <span
                className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5"
                style={{ color: badgeColor, backgroundColor: badgeBg }}
              >
                {badge}
              </span>
            </div>
            <div
              className="text-sm font-semibold font-mono"
              style={{ color: C.ink }}
            >
              ₹{amount}
            </div>
          </div>
        ))}
      </div>

      {/* Footer bar */}
      <div
        className="px-5 py-2.5 flex items-center gap-2"
        style={{ backgroundColor: "#F8F5EF" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: C.teal }}
        />
        <span className="text-[11px]" style={{ color: C.ink2 }}>
          Synced with Tally · 2 hours ago
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROBLEM
// ─────────────────────────────────────────────────────────────

function ProblemSection() {
  const cards = [
    {
      icon: Phone,
      quote: "“Next week sir, pakka.”",
      body: "Every call ends with a verbal promise. No date, no written record. Next week you call again — same story.",
    },
    {
      icon: MessageSquare,
      quote: "“I already sent the payment.”",
      body: "Now you're scrolling through 600 WhatsApp messages trying to find what was actually agreed. The dispute has no paper trail.",
    },
    {
      icon: AlertTriangle,
      quote: "Who's actually overdue vs. just slow?",
      body: "Some parties pay late but always pay. Others have genuinely stopped. Your spreadsheet treats them the same.",
    },
    {
      icon: Clock,
      quote: "3–4 hours a week, just on follow-up calls.",
      body: "Calling 25 parties one by one. Noting it in a separate file. Then doing the exact same round next week.",
    },
  ];

  return (
    <section
      className="py-20 sm:py-24"
      style={{ backgroundColor: C.bgAlt }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-12">
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", color: C.ink }}
          >
            Sound familiar?
          </h2>
          <p className="text-lg" style={{ color: C.ink2 }}>
            If you sell on credit, these conversations happen every single week.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {cards.map(({ icon: Icon, quote, body }) => (
            <div
              key={quote}
              className="group rounded-2xl p-7 border transition-shadow hover:shadow-md"
              style={{ backgroundColor: C.white, borderColor: C.border }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: C.tealLight, color: C.teal }}
              >
                <Icon size={18} />
              </div>
              {/* The quote IS the headline — large italic serif */}
              <blockquote
                className="font-display italic font-semibold leading-snug mb-3"
                style={{ fontSize: "1.2rem", color: C.ink }}
              >
                {quote}
              </blockquote>
              <p className="text-sm leading-relaxed" style={{ color: C.ink2 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// HOW IT WORKS
// ─────────────────────────────────────────────────────────────

function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      icon: Database,
      title: "Connect your accounting data",
      body: "Import parties and invoices from Tally, Zoho Books, or upload an Excel file. PayTrack handles the mapping — no manual re-entry.",
    },
    {
      num: "02",
      icon: BarChart3,
      title: "See exactly who's overdue",
      body: "Your dashboard shows outstanding amounts, days overdue, and priority for every party. No formula-writing. No pivot tables.",
    },
    {
      num: "03",
      icon: Zap,
      title: "Send a follow-up in one click",
      body: "PayTrack drafts a message based on the invoice and the party's history. You review it, edit if needed, and send via WhatsApp or SMS.",
    },
    {
      num: "04",
      icon: FileText,
      title: "Promises and payments, tracked",
      body: "Log a promise-to-pay with a date and amount. If it doesn't arrive, you get reminded. Every conversation has a written record.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-20 sm:py-24"
      style={{ backgroundColor: C.bg }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-14">
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", color: C.ink }}
          >
            From chaos to clarity in four steps
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: C.ink2 }}>
            PayTrack replaces the spreadsheet + WhatsApp + phone-note combination
            that most distributors piece together.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
          {steps.map(({ num, icon: Icon, title, body }, i) => (
            <div key={num} className="relative flex flex-col">
              {/* Step connector (desktop) */}
              {i < steps.length - 1 && (
                <div
                  aria-hidden
                  className="hidden lg:block absolute top-6 left-full w-full h-px"
                  style={{
                    backgroundColor: C.border,
                    transform: "translateX(-50%) scaleX(0.8)",
                    zIndex: 0,
                  }}
                />
              )}

              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 shrink-0 relative z-10"
                style={{ backgroundColor: C.teal, color: C.white }}
              >
                <Icon size={20} />
              </div>
              <div
                className="text-xs font-mono font-medium mb-2"
                style={{ color: C.ink3 }}
              >
                {num}
              </div>
              <h3
                className="font-display font-semibold mb-2"
                style={{ fontSize: "1.05rem", color: C.ink }}
              >
                {title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: C.ink2 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// TRUST  — dark section, prominent placement
// ─────────────────────────────────────────────────────────────

function TrustSection() {
  const points = [
    {
      title: "No shared database",
      body: "Your customer names, invoice amounts, and payment history are stored only in a database that belongs to you — completely separate from every other business using PayTrack.",
    },
    {
      title: "You control the data",
      body: "Your own Supabase project. Export or delete everything at any time, with no lock-in. We can't access your data without your credentials.",
    },
    {
      title: "No percentage on recovered amounts",
      body: "We're not a collections agency. We don't take a cut. Flat monthly pricing regardless of how much you recover.",
    },
  ];

  return (
    <section
      className="py-20 sm:py-24"
      style={{ backgroundColor: C.darkBg }}
    >
      <div className="max-w-5xl mx-auto px-5 sm:px-8 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-8"
          style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
        >
          <Shield size={26} className="text-white" />
        </div>

        <h2
          className="font-display font-bold leading-tight mb-5"
          style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)", color: "#FFFFFF" }}
        >
          Your data lives in your database.{" "}
          <span style={{ color: "rgba(255,255,255,0.55)" }}>Not ours.</span>
        </h2>

        <p
          className="text-lg max-w-2xl mx-auto mb-12 leading-relaxed"
          style={{ color: "rgba(255,255,255,0.72)" }}
        >
          PayTrack is deployed separately for each business. Nothing is shared
          with other companies using this product. This is the core architectural
          difference from most SaaS tools — and it&apos;s not a marketing claim,
          it&apos;s how the infrastructure works.
        </p>

        <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto text-left">
          {points.map(({ title, body }) => (
            <div
              key={title}
              className="rounded-2xl p-6 border"
              style={{
                backgroundColor: "rgba(255,255,255,0.07)",
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <CheckCircle2
                size={18}
                className="mb-3"
                style={{ color: "rgba(255,255,255,0.5)" }}
              />
              <h3 className="font-semibold text-white mb-2 text-sm">{title}</h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// PRICING
// ─────────────────────────────────────────────────────────────

function PricingSection() {
  const features = [
    "Unlimited parties and invoices",
    "Tally, Zoho Books, and Excel import",
    "Follow-up message drafts",
    "Promise-to-pay tracking and reminders",
    "WhatsApp and SMS sending",
    "Your own isolated database",
    "Sync history and audit log",
  ];

  return (
    <section
      id="pricing"
      className="py-20 sm:py-24"
      style={{ backgroundColor: C.bgAlt }}
    >
      <div className="max-w-xl mx-auto px-5 sm:px-8 text-center">
        <h2
          className="font-display font-bold mb-4"
          style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", color: C.ink }}
        >
          Simple, predictable pricing
        </h2>
        <p className="text-lg mb-10" style={{ color: C.ink2 }}>
          One flat monthly price. No per-user fees. No percentage on amounts
          recovered.
        </p>

        <div
          className="rounded-3xl border p-10 shadow-sm text-left"
          style={{ backgroundColor: C.white, borderColor: C.border }}
        >
          {/* TODO: replace placeholder with actual price */}
          <div className="text-center mb-8">
            <div
              className="font-display font-bold leading-none"
              style={{ fontSize: "3.5rem", color: C.ink }}
            >
              ₹ X,XXX
              <span
                className="text-xl font-normal ml-1"
                style={{ color: C.ink3 }}
              >
                /month
              </span>
            </div>
            <p className="mt-2 text-sm" style={{ color: C.ink2 }}>
              per business · all features included
            </p>
          </div>

          <ul className="space-y-3 mb-10">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <CheckCircle2
                  size={16}
                  className="mt-0.5 shrink-0"
                  style={{ color: C.teal }}
                />
                <span style={{ color: C.ink2 }}>{f}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 font-semibold py-3.5 rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.teal }}
          >
            Get started
            <ArrowRight size={15} />
          </Link>
          <p className="mt-4 text-center text-xs" style={{ color: C.ink3 }}>
            Setup takes less than 15 minutes. No card required to start.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────

function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="py-14 border-t"
      style={{ backgroundColor: "#111113", borderColor: "#2A2A2E" }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-mono text-sm font-bold"
                style={{ backgroundColor: C.teal }}
              >
                ₹
              </div>
              <span className="font-display font-semibold text-lg text-white">
                PayTrack
              </span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#71717A" }}>
              Accounts receivable for Indian MSME distributors and manufacturers
              who sell on credit.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-14 sm:gap-20">
            <div>
              <h4
                className="text-[10px] uppercase tracking-widest font-medium mb-4"
                style={{ color: "#52525B" }}
              >
                Product
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "How it works", href: "#how-it-works" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "Sign in", href: "/login" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: "#71717A" }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4
                className="text-[10px] uppercase tracking-widest font-medium mb-4"
                style={{ color: "#52525B" }}
              >
                Account
              </h4>
              <ul className="space-y-2.5">
                {[
                  { label: "Sign in", href: "/login" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: "#71717A" }}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div
          className="pt-6 border-t flex flex-col sm:flex-row justify-between gap-3"
          style={{ borderColor: "#2A2A2E" }}
        >
          <p className="text-xs" style={{ color: "#52525B" }}>
            © {year} PayTrack. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: "#52525B" }}>
            Each customer deployment is fully isolated. No shared data.
          </p>
        </div>
      </div>
    </footer>
  );
}
