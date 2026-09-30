import type { Metadata } from "next";
import { LegalShell, H, P, L } from "@/components/marketing/legal-shell";

// SY26 — DRAFT — reviewed by counsel before launch.
// Required by Razorpay + Play Store store listing.

export const metadata: Metadata = {
  title: "Refund policy — Syncit",
  description:
    "When and how Syncit refunds subscription fees.",
  alternates: { canonical: "https://getsyncit.app/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <LegalShell title="Refund policy" updated="30 September 2026">
      <P>
        We want Syncit to be genuinely useful for your business. If it
        isn&apos;t, we&apos;ll refund the last invoice we billed. Details
        below.
      </P>

      <H>Free trial</H>
      <P>
        The first 14 days are free. Nothing to refund because nothing is
        charged. Cancel any time from Settings before the trial ends
        and you won&apos;t be billed.
      </P>

      <H>Monthly plans</H>
      <L>
        <li>
          Write to <a href="mailto:support@getsyncit.app">support@getsyncit.app</a>
          {" "}within 7 days of the charge. Refund the last month&apos;s fee,
          no questions asked.
        </li>
        <li>
          After 7 days: no refund on the current month, but you can cancel
          renewal at any time. Read-only access continues until the paid
          period ends.
        </li>
      </L>

      <H>Annual plans</H>
      <L>
        <li>
          Within 14 days of the annual charge: full refund on request.
        </li>
        <li>
          After 14 days: pro-rated refund for whole unused months, minus a
          one-time INR 999 administration fee.
        </li>
      </L>

      <H>What&apos;s not refundable</H>
      <L>
        <li>
          Pass-through charges from third-party processors — WhatsApp
          messages sent (billed by Meta), SMS spend (billed by MSG91),
          payment-gateway fees on collected amounts.
        </li>
        <li>Custom onboarding or migration work you engaged us for.</li>
      </L>

      <H>How to request a refund</H>
      <P>
        Email{" "}
        <a href="mailto:support@getsyncit.app">support@getsyncit.app</a>
        {" "}from the address on your account. Include the invoice number.
        We acknowledge within 1 business day and process the refund
        within 7 business days to the original payment method.
      </P>

      <H>Chargebacks</H>
      <P>
        Please talk to us first. Filing a chargeback without reaching out
        may result in immediate account suspension while we investigate.
      </P>
    </LegalShell>
  );
}
