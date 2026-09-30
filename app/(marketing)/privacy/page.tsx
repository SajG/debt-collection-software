import type { Metadata } from "next";
import { LegalShell, H, P, L } from "@/components/marketing/legal-shell";

// SY26 — DRAFT — reviewed by counsel before launch.
// Written to satisfy Google OAuth verification + Play Store + Razorpay
// requirements. India IT Rules 2011/2021 + DPDP Act 2023 in mind.

export const metadata: Metadata = {
  title: "Privacy policy — Syncit",
  description:
    "How Syncit collects, uses, stores and shares information. Data-principal rights and grievance officer contact.",
  alternates: { canonical: "https://getsyncit.app/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy" updated="30 September 2026">
      <P>
        Syncit is an order-to-cash application for businesses in India.
        This page explains what we collect, why, who we share it with, and
        the rights you have as a data principal under India&apos;s IT Rules
        and the Digital Personal Data Protection Act, 2023
        (&quot;DPDP Act&quot;).
      </P>

      <H>Who runs Syncit</H>
      <P>
        Syncit is operated by [Legal entity name], a company registered in
        India. Contact:{" "}
        <a href="mailto:support@getsyncit.app">support@getsyncit.app</a>.
      </P>

      <H>What we collect</H>
      <L>
        <li>
          <strong>Account:</strong> your name, work email, mobile number, and
          the company name you signed up with.
        </li>
        <li>
          <strong>Business data you enter:</strong> your customers, invoices,
          payments, orders, dispatches, and notes on outstanding balances.
        </li>
        <li>
          <strong>Device data:</strong> device model, OS version, app
          version, IP address, and a device identifier we use to enforce
          the one-active-device rule and revoke lost phones.
        </li>
        <li>
          <strong>Usage data:</strong> the pages you visit and the actions
          you take inside the app, plus crash/error logs.
        </li>
        <li>
          <strong>Communications:</strong> when you email or WhatsApp us,
          the message you sent and our reply.
        </li>
      </L>
      <P>
        We do not knowingly collect data about children under 18. Syncit is
        a B2B product.
      </P>

      <H>Why we collect it</H>
      <L>
        <li>
          To provide the service — orders, dispatch, invoicing, follow-ups.
        </li>
        <li>To authenticate you, remember your session, and gate access by role.</li>
        <li>To send transactional email (sign-in codes, receipts).</li>
        <li>To diagnose crashes and improve reliability.</li>
        <li>To comply with tax and accounting rules.</li>
      </L>

      <H>Who we share it with (our processors)</H>
      <P>We use a small set of processors, each under a written data-processing agreement:</P>
      <L>
        <li>
          <strong>Supabase (AWS Mumbai, ap-south-1):</strong> Postgres database and authentication.
        </li>
        <li>
          <strong>Vercel:</strong> web hosting and edge compute.
        </li>
        <li>
          <strong>Resend:</strong> transactional email (sign-in codes, receipts, product notices).
        </li>
        <li>
          <strong>Razorpay:</strong> payment links and subscription billing (India).
        </li>
        <li>
          <strong>Anthropic:</strong> optional AI-generated recovery
          recommendations. Sent as party summaries only; opt out on the Recovery page.
        </li>
        <li>
          <strong>Meta WhatsApp Business API:</strong> utility-category
          reminder messages you initiate.
        </li>
      </L>
      <P>
        We do not sell personal data, and we do not use it to train
        third-party AI models.
      </P>

      <H>Where the data sits</H>
      <P>
        Primary data resides in AWS Mumbai (Supabase). Some processors
        (Vercel, Resend) route traffic through their global infrastructure;
        the Business plan can request in-writing India-only residency.
      </P>

      <H>How long we keep it</H>
      <L>
        <li>Active workspace data: for as long as your subscription is active.</li>
        <li>Sign-in / audit logs: 12 months.</li>
        <li>Backups: 30 days, rolling.</li>
        <li>
          Cancelled workspace: the workspace is placed in read-only mode
          for 30 days, then deleted on request. Aggregate business
          records required for tax law may be retained longer as
          required by that law.
        </li>
      </L>

      <H>Your rights</H>
      <L>
        <li>Export a copy of your data at any time from Settings → Data.</li>
        <li>Correct or delete personal data — email us and we&apos;ll do it within 15 days.</li>
        <li>Withdraw consent for optional processing (e.g. Anthropic recommendations).</li>
        <li>Lodge a grievance with our grievance officer (below) or the Data Protection Board of India.</li>
      </L>

      <H>Grievance officer</H>
      <P>
        <strong>Name:</strong> [To be appointed]<br />
        <strong>Email:</strong>{" "}
        <a href="mailto:grievance@getsyncit.app">grievance@getsyncit.app</a>
        <br />
        <strong>SLA:</strong> acknowledgement within 24 hours, resolution within 15 days as required by Rule 5(9) of the IT Rules, 2011.
      </P>

      <H>Cookies + local storage</H>
      <P>
        We use strictly-necessary cookies to keep you signed in and a
        30-day preference cookie for your language choice. No advertising
        cookies. On mobile we use device secure storage to keep session
        tokens locally.
      </P>

      <H>Changes to this policy</H>
      <P>
        We&apos;ll email account admins when a material change lands. The
        &quot;Last updated&quot; date at the top always reflects the current
        version.
      </P>
    </LegalShell>
  );
}
