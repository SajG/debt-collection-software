import type { Metadata } from "next";
import { LegalShell, H, P, L } from "@/components/marketing/legal-shell";

// SY35 — public account-deletion page. Google Play's Data safety form
// requires a web link (not only an in-app path) explaining how users
// request deletion and what is deleted vs kept. App Store Review 5.1.1(v)
// is satisfied by the in-app path; this page documents it too.

export const metadata: Metadata = {
  title: "Delete your account — Syncit",
  description:
    "How to delete your Syncit account from the app or by email, and what is deleted and what stays with your company.",
  alternates: { canonical: "https://getsyncit.app/delete-account" },
};

export default function DeleteAccountPage() {
  return (
    <LegalShell title="Delete your Syncit account" updated="5 October 2026">
      <P>
        You can delete your Syncit account at any time — from the app, from
        the web, or by email. Deleting your account is permanent.
      </P>

      <H>In the Android or iPhone app</H>
      <L>
        <li>
          Salesperson: open <strong>Settings</strong> → <strong>Account &amp; delete account</strong>.
        </li>
        <li>
          Owner / admin or factory: tap the <strong>⚙</strong> button at the top of the home screen.
        </li>
        <li>
          Read what is deleted, type <strong>DELETE</strong> and tap{" "}
          <strong>Delete my account</strong>. You are signed out straight away.
        </li>
      </L>

      <H>By email</H>
      <P>
        Can&apos;t sign in? Write to{" "}
        <a href="mailto:support@getsyncit.app?subject=Delete%20my%20Syncit%20account">
          support@getsyncit.app
        </a>{" "}
        from the email address on your account with the subject &ldquo;Delete my
        Syncit account&rdquo;. We confirm it is you, then delete the account
        within 7 days and reply when it&apos;s done.
      </P>

      <H>What is deleted</H>
      <L>
        <li>Your sign-in (email login, Google login and two-step verification).</li>
        <li>Your name, phone number and email address.</li>
        <li>Your notification settings, and every phone signed in to your account.</li>
        <li>Your access to every company in Syncit.</li>
      </L>

      <H>What stays with your company</H>
      <P>
        Orders, payments, notes and documents you recorded are your
        company&apos;s business records, and the company is required to keep
        them (for example for GST). They stay with the company and show your
        name as &ldquo;Former member&rdquo;. Nothing in them identifies you by
        phone or email.
      </P>

      <H>If you own a company</H>
      <P>
        A company must always have an owner. Before deleting your account,
        either make another admin the owner (web: <strong>Admin → Users →
        Make owner</strong>) or delete the company (web: <strong>Settings →
        Company → Delete company</strong>).
      </P>

      <H>Deleting a whole company</H>
      <P>
        Owners can delete the company and all of its data from{" "}
        <strong>Settings → Company</strong> on the web. Download your data
        first — the company becomes read-only for 30 days (you can cancel
        during that time), and then every record and uploaded file is
        permanently erased. Syncit keeps only the tax invoices it issued to
        you for its own subscription fees, as the law requires.
      </P>
    </LegalShell>
  );
}
