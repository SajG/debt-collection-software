"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { C } from "./tokens";

const faqs = [
  {
    q: "How is this different from a collections agency?",
    a: "PayTrack is not a collections agency and doesn't act on your behalf. It's software your own business uses to follow up on your own invoices with your own customers — the same reminders you'd send from your phone, just organised, drafted for you, and logged. We never contact your customers ourselves, and we never take a percentage of what you recover.",
  },
  {
    q: "Does this work with Tally?",
    a: "Yes. You can import parties and invoices from Tally exports, and on the Business plan PayTrack syncs live with Tally on your LAN, plus Zoho Books, QuickBooks, and Xero in the cloud. Zoho Books and Excel/CSV imports work on every plan.",
  },
  {
    q: "Is my data shared with other businesses using PayTrack?",
    a: "No — and this is architectural, not a policy promise. Each business runs on its own isolated database. Your customer names, invoice amounts, and payment history are never in the same database as another company's data.",
  },
  {
    q: "What happens if a customer disputes an invoice?",
    a: "You can mark an invoice as disputed, and PayTrack automatically pauses reminders for it until the dispute is resolved. Nobody gets an automated nudge about an amount they're actively contesting.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. There's no lock-in and no cancellation fee. You keep access until the end of your paid period, and you can export all your data before your account closes. See our cancellation policy for details.",
  },
  {
    q: "Is the WhatsApp messaging compliant?",
    a: "PayTrack sends WhatsApp messages through the official WhatsApp Business API using approved message templates, following Meta's business messaging policies. You're responsible for having a genuine business relationship with the customers you message — which, for your own invoiced parties, you already do.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="py-20 sm:py-24" style={{ backgroundColor: C.bg }}>
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-12">
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", color: C.ink }}
          >
            Frequently asked questions
          </h2>
          <p className="text-lg" style={{ color: C.ink2 }}>
            The things distributors ask before they start.
          </p>
        </div>

        <Accordion.Root type="single" collapsible className="space-y-3">
          {faqs.map(({ q, a }, i) => (
            <Accordion.Item
              key={q}
              value={`faq-${i}`}
              className="rounded-2xl border overflow-hidden"
              style={{ backgroundColor: C.white, borderColor: C.border }}
            >
              <Accordion.Header asChild>
                <h3 className="m-0">
                  <Accordion.Trigger className="group w-full flex items-center justify-between gap-4 px-6 py-5 text-left">
                    <span
                      className="font-display font-semibold"
                      style={{ fontSize: "1.05rem", color: C.ink }}
                    >
                      {q}
                    </span>
                    <ChevronDown
                      size={18}
                      className="shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                      style={{ color: C.ink3 }}
                      aria-hidden
                    />
                  </Accordion.Trigger>
                </h3>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                <p
                  className="px-6 pb-5 text-sm leading-relaxed"
                  style={{ color: C.ink2 }}
                >
                  {a}
                </p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
