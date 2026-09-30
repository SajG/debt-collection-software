import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SiteShell, Section, H2 } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";
import { PLANS, priceLabel, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing — Syncit",
  description:
    "Three plans — Starter ₹1,999/mo, Growth ₹4,999/mo, Business (talk to us). Annual = 2 months free. All prices exclude GST. 14-day free trial, no card.",
  alternates: { canonical: "https://getsyncit.app/pricing" },
};

export default function PricingPage() {
  return (
    <SiteShell>
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: mkt.teal }}
          >
            Pricing
          </p>
          <H2 center>Simple, predictable, no percentage on recovered amounts</H2>
          <p className="text-lg" style={{ color: mkt.ink2 }}>
            Prices exclude GST. Annual plans are billed as 10 months (2 months
            free). {TRIAL_DAYS}-day free trial on every plan — no credit card.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3 mb-14">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              id={plan.id}
              className="rounded-2xl p-8 border flex flex-col"
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
              <h3 className="font-display font-bold text-2xl mb-1" style={{ color: mkt.ink }}>
                {plan.name}
              </h3>
              <p className="text-sm mb-5" style={{ color: mkt.ink2 }}>
                {plan.tagline}
              </p>
              <div className="mb-1">
                <span className="font-mono font-bold text-3xl" style={{ color: mkt.ink }}>
                  {priceLabel(plan, "monthly")}
                </span>
                {plan.monthlyINR !== null && (
                  <span className="text-sm ml-1.5" style={{ color: mkt.ink3 }}>
                    + GST
                  </span>
                )}
              </div>
              {plan.annualINR !== null && (
                <p className="text-xs mb-5" style={{ color: mkt.ink3 }}>
                  Or {priceLabel(plan, "annual")} billed annually · 2 months free
                </p>
              )}
              <ul className="space-y-2.5 my-5 flex-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: mkt.ink2 }}
                  >
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: mkt.teal }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {plan.featureNote && (
                <p className="text-xs mb-4" style={{ color: mkt.ink3 }}>
                  {plan.featureNote}
                </p>
              )}
              <Link
                href={plan.ctaHref}
                className="w-full text-center rounded-xl py-2.5 text-sm font-semibold"
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

        <div
          className="rounded-2xl p-8 mb-14 border"
          style={{ backgroundColor: mkt.tealLight, borderColor: mkt.border }}
        >
          <h3 className="font-display font-bold text-xl mb-3" style={{ color: mkt.ink }}>
            What&apos;s NOT charged extra
          </h3>
          <ul className="grid gap-2 text-sm sm:grid-cols-2" style={{ color: mkt.ink2 }}>
            {[
              "Percentage on amounts recovered — flat monthly regardless",
              "Onboarding and Excel import — free on every plan",
              "Mobile app — included",
              "Email + WhatsApp support — included",
              "Data export — one click, any time",
              "Extra WhatsApp / SMS spend passes through at cost",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: mkt.teal }} />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="max-w-2xl mx-auto text-center">
          <h3 className="font-display font-bold text-xl mb-3" style={{ color: mkt.ink }}>
            Not sure which plan?
          </h3>
          <p className="text-sm mb-6" style={{ color: mkt.ink2 }}>
            Start Growth — most distributors land there anyway. Downgrade to
            Starter any time before the trial ends. Business is for multi-
            office or heavy WhatsApp volume.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white"
              style={{ backgroundColor: mkt.teal }}
            >
              Start free trial
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl border"
              style={{ color: mkt.ink, borderColor: mkt.border, backgroundColor: mkt.white }}
            >
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
