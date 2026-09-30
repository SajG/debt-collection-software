import type { Metadata } from "next";
import { LegalShell, H, P, L } from "@/components/marketing/legal-shell";

// SY26 — DRAFT — reviewed by counsel before launch.

export const metadata: Metadata = {
  title: "Terms of service — Syncit",
  description:
    "The rules for using Syncit — subscription, uptime, acceptable use, and how we handle disputes.",
  alternates: { canonical: "https://getsyncit.app/terms" },
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of service" updated="30 September 2026">
      <P>
        These terms govern your use of Syncit. Signing up or using the app
        means you agree to them. Governing law is India; courts in Pune
        have exclusive jurisdiction. In case of conflict between English
        and any translation, English controls.
      </P>

      <H>1. Who&apos;s who</H>
      <P>
        &quot;Syncit&quot;, &quot;we&quot;, or &quot;us&quot; means
        [Legal entity name]. &quot;You&quot; means the business signing up.
        Users you invite are covered by the same terms.
      </P>

      <H>2. Your account</H>
      <L>
        <li>You&apos;re responsible for what happens under your account.</li>
        <li>
          The workspace owner (first sign-up) is billing-responsible for the
          subscription.
        </li>
        <li>
          Don&apos;t share sign-in credentials. If a device is lost, revoke
          it from Admin → Devices immediately.
        </li>
      </L>

      <H>3. Subscription + trial</H>
      <L>
        <li>Every plan starts with a 14-day free trial. No credit card required.</li>
        <li>
          After the trial, unless you cancel, we charge the plan you picked.
          Monthly plans renew monthly; annual plans renew annually.
        </li>
        <li>All prices exclude GST. GST is added at the rate applicable at billing time.</li>
        <li>
          Currency: INR. Payments processed by Razorpay under their own
          terms.
        </li>
      </L>

      <H>4. Cancellation</H>
      <L>
        <li>Cancel any time from Settings → Billing.</li>
        <li>
          On cancellation, you keep read-only access until the end of the
          paid period. Nothing is deleted for 30 days after that.
        </li>
        <li>See <a href="/refund-policy">Refund policy</a> for what&apos;s refundable.</li>
      </L>

      <H>5. Acceptable use</H>
      <P>Don&apos;t use Syncit to:</P>
      <L>
        <li>Break Indian law or the law of the country the recipient is in.</li>
        <li>
          Send unsolicited marketing / promotional / spam messages —
          the WhatsApp integration is strictly for utility templates
          triggered by the customer&apos;s own balance.
        </li>
        <li>Reverse-engineer, scrape, or resell the service.</li>
        <li>Impersonate anyone, or store data you don&apos;t have permission to store.</li>
      </L>

      <H>6. Uptime + support</H>
      <L>
        <li>
          We target 99.5% monthly uptime. The Business plan can request a
          written SLA with credits.
        </li>
        <li>
          Support: email &amp; WhatsApp during Indian business hours.
          Response within 1 business day on Starter, same day on Growth,
          hours on Business.
        </li>
      </L>

      <H>7. Your data, our data</H>
      <L>
        <li>Your data belongs to you. Full export at any time.</li>
        <li>
          We use it only to run the service (see the{" "}
          <a href="/privacy">Privacy policy</a>).
        </li>
        <li>
          Aggregated, anonymised metrics (e.g. &quot;median distributor
          collects X% of overdue in Y days&quot;) may be published — never
          your business specifically.
        </li>
      </L>

      <H>8. Third-party services</H>
      <P>
        Syncit sits alongside Tally, Zoho Books, QuickBooks, Xero,
        Razorpay, Meta WhatsApp, etc. Their terms apply to their bits;
        we don&apos;t warrant them.
      </P>

      <H>9. Warranty + liability</H>
      <P>
        We work hard to keep Syncit useful and safe, but the service is
        provided &quot;as is&quot;. Our aggregate liability in any 12-month
        period is capped at the fees you paid in that period. We are not
        liable for indirect, incidental, or consequential losses. Nothing
        here limits liability where the law says it can&apos;t be limited.
      </P>

      <H>10. Changes to these terms</H>
      <P>
        We&apos;ll email workspace owners at least 15 days before any
        material change. Continuing to use Syncit after that means you
        accept the new terms.
      </P>

      <H>11. Contact</H>
      <P>
        <a href="mailto:support@getsyncit.app">support@getsyncit.app</a> —
        or grievance officer:{" "}
        <a href="mailto:grievance@getsyncit.app">grievance@getsyncit.app</a>.
      </P>
    </LegalShell>
  );
}
