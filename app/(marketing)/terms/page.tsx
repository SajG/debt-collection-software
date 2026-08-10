/* <!-- DRAFT: business/legal review required before this is relied upon in production --> */
import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service — PayTrack",
  description: "Terms of Service for the PayTrack accounts receivable platform.",
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" lastUpdated="9 July 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use
        of PayTrack (the &quot;Service&quot;), an accounts receivable and
        invoice follow-up platform for businesses. By creating an account or
        using the Service, you agree to these Terms on behalf of the business
        you represent.
      </p>

      <h2>1. What PayTrack is (and is not)</h2>
      <p>
        PayTrack is <strong>first-party accounts receivable software</strong>.
        It helps your business track its own outstanding invoices and send
        payment reminders and follow-ups to its own customers, with whom it has
        a direct commercial relationship.
      </p>
      <p>
        PayTrack is <strong>not a debt collection agency</strong> and does not
        collect debts on anyone&apos;s behalf. We never contact your customers
        ourselves, we do not purchase or take assignment of receivables, and we
        do not charge any percentage of amounts you recover. All communication
        sent through the Service is sent by your business, in your
        business&apos;s name, at your direction.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>
          You must be at least 18 years old and authorised to act for the
          business registering the account.
        </li>
        <li>
          The Service is intended for business use in connection with genuine
          commercial receivables — not for consumer or personal use.
        </li>
        <li>
          You are responsible for keeping your login credentials secure and for
          all activity that happens under your account, including activity by
          staff users you invite.
        </li>
        <li>
          Information you provide at signup must be accurate and kept up to
          date.
        </li>
      </ul>

      <h2>3. Subscription, billing and renewal</h2>
      <ul>
        <li>
          The Service is offered on paid subscription plans, billed monthly or
          annually in advance.
        </li>
        <li>
          Subscriptions <strong>renew automatically</strong> at the end of each
          billing period unless cancelled before the renewal date. You can
          cancel at any time from account settings — see our{" "}
          <Link href="/cancellation-policy">Cancellation Policy</Link>.
        </li>
        <li>
          Refunds are governed by our{" "}
          <Link href="/refund-policy">Refund Policy</Link>.
        </li>
        <li>
          Prices are stated exclusive of GST and other applicable taxes, which
          will be added where required.
        </li>
        <li>
          We may change plan pricing with at least 30 days&apos; notice; changes
          take effect from your next renewal.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree that you will:</p>
      <ul>
        <li>
          only send messages through the Service to customers of your own
          business with whom you have a genuine, existing commercial
          relationship, and for whom you have the necessary consent or lawful
          basis to contact;
        </li>
        <li>
          comply with applicable law when messaging, including telecom and
          messaging regulations (such as TRAI regulations for SMS in India) and
          the policies of channel providers (such as Meta&apos;s WhatsApp
          Business messaging policies);
        </li>
        <li>
          use the Service only for your own first-party receivables — you must
          not use it to collect debts owed to third parties, to operate as a
          collections agency, or to pursue purchased or assigned debt;
        </li>
        <li>
          not use the Service to harass, threaten, or intimidate anyone,
          to send abusive or misleading messages, or to contact people at
          unreasonable frequency or hours;
        </li>
        <li>
          not upload data you do not have the right to process, attempt to
          breach the Service&apos;s security, or resell access to the Service.
        </li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate this section. You are
        solely responsible for the content of messages you send and for your
        compliance with laws applying to your business&apos;s communications.
      </p>

      <h2>5. Your data</h2>
      <p>
        Data you upload (including your customers&apos; names, contact details,
        and invoice records) remains yours. Each business&apos;s data is stored
        in its own isolated database. How we handle data is described in our{" "}
        <Link href="/privacy">Privacy Policy</Link> and{" "}
        <Link href="/data-policy">Data Deletion Policy</Link>.
      </p>

      <h2>6. Availability and changes to the Service</h2>
      <p>
        We work to keep the Service available and reliable, but it is provided
        &quot;as is&quot; and we do not guarantee uninterrupted availability.
        We may modify features over time; if we materially reduce core
        functionality of your plan, we will tell you in advance.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law: (a) PayTrack is not liable for
        indirect, incidental, or consequential losses, loss of profits, or loss
        of business arising from use of the Service; (b) our total aggregate
        liability for any claim arising out of or relating to the Service is
        limited to the subscription fees you paid to us in the twelve months
        preceding the claim; and (c) we are not responsible for whether your
        customers actually pay you — the Service is a tool for organising and
        sending your follow-ups, not a guarantee of recovery.
      </p>
      <p>
        Nothing in these Terms excludes liability that cannot be excluded under
        applicable law.
      </p>

      <h2>8. Termination</h2>
      <ul>
        <li>
          You may stop using the Service and cancel your subscription at any
          time.
        </li>
        <li>
          We may suspend or terminate your account for material breach of these
          Terms (including the acceptable-use rules in section 4), for
          non-payment, or where required by law. Where practical, we will give
          you notice and a chance to remedy the breach first.
        </li>
        <li>
          On account closure, data export and deletion are handled as described
          in the <Link href="/data-policy">Data Deletion Policy</Link>.
        </li>
      </ul>

      <h2>9. Governing law</h2>
      <p>
        {/* PLACEHOLDER: confirm jurisdiction — currently India-wide; adjust if serving other markets */}
        These Terms are governed by the laws of India, and the courts of India
        have exclusive jurisdiction over any dispute arising from them or from
        use of the Service.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material
        changes, we will notify account owners by email or in-product notice at
        least 15 days before they take effect. Continued use of the Service
        after that date constitutes acceptance of the updated Terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        {/* PLACEHOLDER: replace with real support email */}
        <a href="mailto:support@paytrack.example.com">
          support@paytrack.example.com
        </a>
        .
      </p>
    </LegalShell>
  );
}
