/* <!-- DRAFT: business/legal review required before this is relied upon in production --> */
import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — PayTrack",
  description: "How PayTrack collects, uses, and protects data.",
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated="9 July 2026">
      <p>
        This policy explains what data PayTrack handles, why, and what rights
        you have. It covers two distinct kinds of data, and it&apos;s important
        to keep them separate:
      </p>
      <ul>
        <li>
          <strong>Account data</strong> — information about you and your
          business (name, email, phone, billing details) that you give us when
          you sign up and use the Service. For this data, PayTrack is the{" "}
          <strong>data controller</strong>.
        </li>
        <li>
          <strong>Party data</strong> — information about your business&apos;s
          own customers (their names, phone numbers, email addresses, invoice
          amounts, and payment history) that <strong>you upload</strong> or
          sync from your accounting system. For this data,{" "}
          <strong>your business is the controller</strong> and PayTrack acts as
          a <strong>data processor</strong>, handling it only to provide the
          Service to you and only on your instructions.
        </li>
      </ul>

      <h2>1. What we collect</h2>
      <h3>Account data (we are the controller)</h3>
      <ul>
        <li>Business name, your name, email address, and phone number</li>
        <li>Login credentials (passwords are stored hashed, never in plain text)</li>
        <li>Billing and subscription information</li>
        <li>
          Product usage and diagnostic data (errors, performance metrics) used
          to keep the Service working
        </li>
      </ul>
      <h3>Party data (you are the controller, we process it)</h3>
      <ul>
        <li>Customer (party) names and contact details you upload</li>
        <li>Invoice records, amounts, due dates, and payment history</li>
        <li>
          Notes, promises-to-pay, and the content of reminder messages sent
          through the Service
        </li>
      </ul>
      <p>
        You are responsible for ensuring you have the right to upload and
        process your customers&apos; data — including any consent or lawful
        basis required to send them payment communications.
      </p>

      <h2>2. How your data is stored — one database per business</h2>
      <p>
        Each business using PayTrack runs on its <strong>own isolated
        database</strong>. Your party data is never stored in the same database
        as another company&apos;s data, is never pooled or aggregated across
        customers, and is never used to build shared datasets, train models, or
        profile anyone. This is how the infrastructure is built, not just a
        policy statement.
      </p>

      <h2>3. How messages flow through providers</h2>
      <p>
        When you send a reminder, the message content and the recipient&apos;s
        contact details necessarily pass through the delivery channel you
        chose:
      </p>
      <ul>
        <li>
          <strong>WhatsApp</strong> — sent via the official WhatsApp Business
          API (operated by Meta), subject to Meta&apos;s terms and privacy
          practices;
        </li>
        <li>
          <strong>SMS</strong> — sent via telecom SMS gateway providers;
        </li>
        <li>
          <strong>Email</strong> — sent via transactional email providers.
        </li>
      </ul>
      <p>
        These providers process message data only to deliver it. We share the
        minimum needed for delivery (recipient address/number and message
        content) and nothing more. Payment collection links, where used, are
        processed by the payment provider (e.g. Razorpay) under their own
        terms.
      </p>

      <h2>4. What we never do with your data</h2>
      <ul>
        <li>We do not sell account data or party data to anyone.</li>
        <li>We do not share your customer lists with other businesses.</li>
        <li>
          We do not use your party data for advertising or cross-customer
          analytics.
        </li>
      </ul>

      <h2>5. Data retention</h2>
      <ul>
        <li>
          <strong>While your account is active:</strong> we keep your data so
          the Service works — receivables history is the product.
        </li>
        <li>
          <strong>After account closure:</strong> data is retained for a
          limited export window and then deleted, as described in the{" "}
          <Link href="/data-policy">Data Deletion Policy</Link>{" "}
          {/* PLACEHOLDER default: 30-day export window, then deletion */}
          (by default, export available for 30 days, then deletion).
        </li>
        <li>
          Billing records may be retained longer where tax or accounting law
          requires it.
        </li>
      </ul>

      <h2>6. Security</h2>
      <p>
        Data is encrypted in transit (TLS) and at rest. Access to production
        systems is restricted and logged. Because each business has its own
        database, a defect or breach affecting one deployment does not expose
        other businesses&apos; data.
      </p>

      <h2>7. Your rights</h2>
      <h3>If you are a PayTrack account holder</h3>
      <p>
        You can access, correct, export, or delete your account data and your
        business&apos;s party data at any time from within the product, or by
        contacting us. Applicable data protection law (including India&apos;s
        Digital Personal Data Protection Act, 2023) may give you additional
        rights of access, correction, and erasure.
      </p>
      <h3>If you are a customer of a business that uses PayTrack</h3>
      <p>
        If a distributor or supplier uses PayTrack to manage invoices they have
        issued to you, that business — not PayTrack — controls your data.
        Requests to correct or delete your information should go to that
        business directly. The{" "}
        <Link href="/data-policy">Data Deletion Policy</Link> explains how such
        requests are handled and how we assist. If you contact us directly, we
        will forward your request to the relevant business where we can
        identify it.
      </p>

      <h2>8. Cookies</h2>
      <p>
        The Service uses cookies strictly needed to keep you signed in and to
        secure your session. The marketing site does not use advertising or
        cross-site tracking cookies.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        If we make material changes, we will notify account owners by email or
        in-product notice before they take effect.
      </p>

      <h2>10. Contact</h2>
      <p>
        For privacy questions or data requests:{" "}
        {/* PLACEHOLDER: replace with real privacy/support email */}
        <a href="mailto:privacy@paytrack.example.com">
          privacy@paytrack.example.com
        </a>
        .
      </p>
    </LegalShell>
  );
}
