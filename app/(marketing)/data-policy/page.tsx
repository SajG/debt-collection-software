/* <!-- DRAFT: business/legal review required before this is relied upon in production --> */
import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Data Deletion Policy — PayTrack",
  description:
    "How data deletion works on PayTrack, for account holders and for their customers.",
  robots: { index: false },
};

export default function DataPolicyPage() {
  return (
    <LegalShell title="Data Deletion Policy" lastUpdated="9 July 2026">
      <p>
        This policy covers two different situations that are easy to conflate,
        so we handle them separately:
      </p>
      <ol>
        <li>
          A <strong>business that uses PayTrack</strong> closing its account
          and wanting its data deleted.
        </li>
        <li>
          A <strong>customer of such a business</strong> (a &quot;party&quot;
          receiving payment reminders) wanting their personal data removed from
          that business&apos;s PayTrack account.
        </li>
      </ol>

      <h2>1. Account holders: deletion on account closure</h2>
      <p>
        When your subscription ends (cancellation or non-renewal), this is the
        timeline:
      </p>
      {/* PLACEHOLDER: 30-day window and 60-day backup purge are adjustable
          defaults — confirm before launch */}
      <ul>
        <li>
          <strong>Days 0–30 after your paid period ends:</strong> your account
          becomes read-only. You can export everything — parties, invoices,
          payments, promises, and message logs — in standard formats (CSV).
        </li>
        <li>
          <strong>After day 30:</strong> your database — including all party
          data your business uploaded — is deleted. Because each business runs
          on its own isolated database, deletion means the database itself is
          removed, not rows filtered out of a shared system.
        </li>
        <li>
          <strong>Backups:</strong> encrypted backups age out within a further
          60 days. Billing records we are legally required to keep (tax,
          accounting) are retained per statutory periods, but contain no party
          data.
        </li>
        <li>
          You can also request immediate deletion without waiting out the
          export window by emailing us from your account email.
        </li>
      </ul>

      <h2>2. What deletion of an account includes</h2>
      <ul>
        <li>All party (customer) records the business uploaded or synced</li>
        <li>All invoices, payments, and promise-to-pay records</li>
        <li>All reminder message drafts and send logs</li>
        <li>All staff user accounts under the business</li>
      </ul>

      <h2>
        3. Parties: removing your data from a business&apos;s PayTrack account
      </h2>
      <p>
        If a distributor or supplier sends you payment reminders through
        PayTrack, <strong>that business controls your data</strong> — PayTrack
        processes it only on their instructions. This is different from the
        account-holder rights above.
      </p>
      <ul>
        <li>
          <strong>First, contact the business directly.</strong> They can
          correct or delete your record in their PayTrack account, and they are
          the party legally responsible for your data. Note that they may have
          legitimate grounds to retain invoice records (for example, tax law
          requires businesses to keep records of issued invoices) even if
          contact details are removed and messaging stops.
        </li>
        <li>
          <strong>To stop receiving messages</strong>, tell the business or
          reply to the message asking them to stop; they can mark you as
          do-not-contact in PayTrack.
        </li>
        <li>
          <strong>If you contact us instead</strong> at the address below, we
          will identify the business where possible and forward your request to
          them. We cannot delete data from a business&apos;s database on our
          own initiative, because we act as their processor — but we do require
          (in our <Link href="/terms">Terms of Service</Link>) that businesses
          using PayTrack handle such requests lawfully.
        </li>
      </ul>

      <h2>4. Relationship to the Privacy Policy</h2>
      <p>
        This policy covers deletion specifically. What data is collected, how
        it is stored (one isolated database per business), and how it flows
        through messaging providers is described in the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>5. Contact</h2>
      <p>
        Deletion requests and questions:{" "}
        {/* PLACEHOLDER: replace with real privacy/support email */}
        <a href="mailto:privacy@paytrack.example.com">
          privacy@paytrack.example.com
        </a>
        .
      </p>
    </LegalShell>
  );
}
