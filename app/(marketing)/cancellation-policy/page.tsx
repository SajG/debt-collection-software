/* <!-- DRAFT: business/legal review required before this is relied upon in production --> */
import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Cancellation Policy — PayTrack",
  description: "How to cancel a PayTrack subscription and what happens after.",
  robots: { index: false },
};

export default function CancellationPolicyPage() {
  return (
    <LegalShell title="Cancellation Policy" lastUpdated="9 July 2026">
      <p>
        There is no lock-in. You can cancel your PayTrack subscription at any
        time, yourself, with no cancellation fee and no notice period.
      </p>

      <h2>1. How to cancel</h2>
      <p>
        Go to <strong>Settings → Subscription → Cancel subscription</strong> in
        your account. Cancellation takes effect immediately for billing — you
        will not be charged again. If you have any trouble, email support and
        we will cancel it for you.
      </p>

      <h2>2. What happens when you cancel</h2>
      <ul>
        <li>
          <strong>Access continues</strong> until the end of the billing period
          you have already paid for (month or year). Nothing is cut off early.
        </li>
        <li>
          <strong>No further charges</strong> — auto-renewal stops immediately.
        </li>
        <li>
          <strong>No partial-month refunds</strong> — refunds are governed
          entirely by the <Link href="/refund-policy">Refund Policy</Link>{" "}
          (the same 7-day new-subscription window applies; this policy does not
          add or change any refund terms).
        </li>
      </ul>

      <h2>3. Your data after cancellation</h2>
      <p>
        {/* PLACEHOLDER: 30-day export window is an adjustable default —
            keep consistent with the Data Deletion Policy */}
        After your paid period ends, your account enters a read-only export
        window of <strong>30 days</strong>, during which you can export all
        your data (parties, invoices, payment history, message logs). After
        that window, your data is deleted as described in the{" "}
        <Link href="/data-policy">Data Deletion Policy</Link>.
      </p>

      <h2>4. Reactivating</h2>
      <p>
        If you resubscribe during the 30-day export window, your account and
        data are restored exactly as they were. After deletion, a new account
        starts fresh.
      </p>

      <h2>5. Contact</h2>
      <p>
        Questions about cancelling:{" "}
        {/* PLACEHOLDER: replace with real support email */}
        <a href="mailto:support@paytrack.example.com">
          support@paytrack.example.com
        </a>
        .
      </p>
    </LegalShell>
  );
}
