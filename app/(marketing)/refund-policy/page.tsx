/* <!-- DRAFT: business/legal review required before this is relied upon in production --> */
import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Refund Policy — PayTrack",
  description: "PayTrack's refund policy for subscription payments.",
  robots: { index: false },
};

export default function RefundPolicyPage() {
  return (
    <LegalShell title="Refund Policy" lastUpdated="9 July 2026">
      <p>
        We keep this simple: try PayTrack properly, and if it isn&apos;t right
        for your business in the first week, we&apos;ll refund you. Beyond
        that, subscription payments are generally non-refundable.
      </p>

      {/* PLACEHOLDER: all numeric thresholds below (7 days, 20 messages) are
          adjustable defaults — confirm before launch */}

      <h2>1. New subscriptions — 7-day window</h2>
      <p>
        If you cancel within <strong>7 days</strong> of starting a{" "}
        <strong>new</strong> paid subscription and your usage has been minimal
        (fewer than <strong>20 messages sent</strong> through the Service), we
        will refund your payment, pro-rated for the unused period. Contact
        support with your account email and we&apos;ll process it within 7
        business days to your original payment method.
      </p>

      <h2>2. Renewals</h2>
      <p>
        Renewal payments (monthly or annual) are <strong>not refundable</strong>{" "}
        after the first 7-day window of your original subscription has passed.
        To avoid an unwanted renewal charge, cancel before your renewal date —
        cancellation is immediate and self-serve, see the{" "}
        <Link href="/cancellation-policy">Cancellation Policy</Link>.
      </p>

      <h2>3. Partial months</h2>
      <p>
        We do not issue refunds for partial billing periods. If you cancel
        mid-period, you keep full access until the end of the period you have
        paid for, and you simply aren&apos;t charged again.
      </p>

      <h2>4. Exceptions</h2>
      <ul>
        <li>
          <strong>Duplicate or erroneous charges</strong> — refunded in full,
          always. Just tell us.
        </li>
        <li>
          <strong>Extended outages</strong> — if a prolonged Service outage on
          our side materially prevented you from using PayTrack, we will credit
          or refund the affected period at our discretion.
        </li>
        <li>
          Nothing in this policy limits rights you have under applicable
          consumer protection law that cannot be waived.
        </li>
      </ul>

      <h2>5. How to request a refund</h2>
      <p>
        Email{" "}
        {/* PLACEHOLDER: replace with real support email */}
        <a href="mailto:support@paytrack.example.com">
          support@paytrack.example.com
        </a>{" "}
        from your account email with the payment reference. Approved refunds
        are returned to the original payment method; bank processing typically
        takes 5–10 business days after we initiate it.
      </p>
    </LegalShell>
  );
}
