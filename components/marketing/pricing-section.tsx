"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { C } from "./tokens";

/* PRICING PLACEHOLDER: confirm these tiers/prices reflect actual unit economics
   (WhatsApp conversation costs, Razorpay fees, support cost) before launch */

const tiers = [
  {
    name: "Starter",
    monthly: 1499,
    annual: 1249, // monthly equivalent on annual billing (2 months free)
    blurb: "For a single owner-operator getting off Excel.",
    features: [
      "Up to 50 active parties",
      "WhatsApp, SMS & email reminders",
      "CSV / Excel import",
      "1 user login",
      "Standard support",
    ],
    highlighted: false,
  },
  {
    name: "Growth",
    monthly: 3999,
    annual: 3333,
    blurb: "For distributors with staff doing daily follow-up.",
    features: [
      "Up to 250 active parties",
      "Unlimited staff logins",
      "Proforma & tax invoices with your branding (PDF)",
      "Promise-to-pay tracking & reminders",
      "Priority support",
    ],
    highlighted: true,
  },
  {
    name: "Business",
    monthly: 9999,
    annual: 8333,
    blurb: "For larger operations running on live accounting data.",
    features: [
      "Unlimited parties",
      "Live accounting sync (Tally, Zoho, QuickBooks, Xero)",
      "API access",
      "Dedicated onboarding call",
      "Priority support SLA",
    ],
    highlighted: false,
  },
];

const formatINR = (n: number) => n.toLocaleString("en-IN");

export function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section
      id="pricing"
      className="py-20 sm:py-24"
      style={{ backgroundColor: C.bgAlt }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-10">
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", color: C.ink }}
          >
            Simple, predictable pricing
          </h2>
          <p className="text-lg" style={{ color: C.ink2 }}>
            Flat monthly price per business. No per-message fees. No percentage
            on amounts recovered.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span
            className="text-sm"
            style={{ color: annual ? C.ink3 : C.ink, fontWeight: annual ? 400 : 600 }}
          >
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle annual billing"
            onClick={() => setAnnual(!annual)}
            className="relative w-11 h-6 rounded-full transition-colors"
            style={{ backgroundColor: annual ? C.teal : C.border }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{
                transform: annual ? "translateX(20px)" : "translateX(0)",
              }}
            />
          </button>
          <span
            className="text-sm"
            style={{ color: annual ? C.ink : C.ink3, fontWeight: annual ? 600 : 400 }}
          >
            Annual
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: C.tealLight, color: C.teal }}
          >
            2 months free
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {tiers.map(
            ({ name, monthly, annual: annualPrice, blurb, features, highlighted }) => (
              <div
                key={name}
                className="relative rounded-3xl border p-8 shadow-sm flex flex-col"
                style={{
                  backgroundColor: C.white,
                  borderColor: highlighted ? C.teal : C.border,
                  borderWidth: highlighted ? 2 : 1,
                }}
              >
                {highlighted && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full text-white whitespace-nowrap"
                    style={{ backgroundColor: C.teal }}
                  >
                    Most popular
                  </span>
                )}

                <h3
                  className="font-display font-semibold text-xl mb-1"
                  style={{ color: C.ink }}
                >
                  {name}
                </h3>
                <p className="text-sm mb-6" style={{ color: C.ink2 }}>
                  {blurb}
                </p>

                <div className="mb-1">
                  <span
                    className="font-display font-bold leading-none"
                    style={{ fontSize: "2.6rem", color: C.ink }}
                  >
                    ₹{formatINR(annual ? annualPrice : monthly)}
                  </span>
                  <span className="text-base ml-1" style={{ color: C.ink3 }}>
                    /month
                  </span>
                </div>
                <p className="text-xs mb-7" style={{ color: C.ink3 }}>
                  {annual
                    ? `billed annually (₹${formatINR(annualPrice * 12)}/year)`
                    : "billed monthly"}
                </p>

                <ul className="space-y-3 mb-8 flex-1">
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
                  href="/signup"
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl transition-opacity hover:opacity-90"
                  style={
                    highlighted
                      ? { backgroundColor: C.teal, color: C.white }
                      : {
                          backgroundColor: C.tealLight,
                          color: C.teal,
                        }
                  }
                >
                  Get started
                  <ArrowRight size={15} />
                </Link>
              </div>
            )
          )}
        </div>

        <p className="mt-8 text-center text-xs" style={{ color: C.ink3 }}>
          Setup takes less than 15 minutes. No card required to start. Prices
          exclude GST.
        </p>
      </div>
    </section>
  );
}
