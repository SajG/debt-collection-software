import type { Metadata } from "next";
import Link from "next/link";
import { requireMembership, tenantDb } from "@/lib/tenant";
import { formatDate } from "@/lib/format";
import { DELETION_GRACE_DAYS } from "@/lib/platform/company-deletion";
import { Card, PageHeader } from "../../_components/ui";
import { CancelDeletionButton, DeleteCompanyForm } from "./company-danger-zone";

export const metadata: Metadata = { title: "Company — Syncit" };
export const dynamic = "force-dynamic";

// SY35 — Settings → Company. Owner-only: download everything, transfer
// ownership, delete the company (30-day soft delete, then purge).

export default async function CompanySettingsPage() {
  const ctx = await requireMembership();
  const db = tenantDb(ctx.organizationId);
  const org = await db.organization.findFirstOrThrow({
    select: { name: true, status: true, deletionScheduledFor: true },
  });

  if (!ctx.isOwner) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader title="Company" />
        <Card>
          <p className="text-sm text-muted-foreground">
            Only the company owner can manage the company. Ask them to open
            Settings → Company.
          </p>
        </Card>
      </div>
    );
  }

  const deleting = org.status === "DELETING";

  return (
    <div id="company" className="space-y-6 p-4 sm:p-8">
      <PageHeader title="Company" subtitle={org.name} />

      <Card title="Download all data">
        <p className="mb-3 text-sm text-muted-foreground">
          Every customer, invoice, payment, follow-up, credit note and
          proforma for {org.name}, as one JSON file. Works even while the
          company is read-only.
        </p>
        <a
          href="/api/data/export?entity=all&format=json"
          download
          className="text-sm font-medium text-primary hover:underline"
        >
          Download everything (JSON)
        </a>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/settings" className="text-sm text-primary hover:underline">
          Per-table CSV exports
        </Link>
      </Card>

      <Card title="Owner">
        <p className="text-sm text-muted-foreground">
          To hand the company to someone else, open{" "}
          <Link href="/admin/users" className="text-primary hover:underline">
            Admin → Users
          </Link>{" "}
          and choose <strong>Make owner</strong> next to an active admin.
        </p>
      </Card>

      {deleting ? (
        <Card title="Deletion scheduled">
          <p className="mb-3 text-sm">
            {org.name} is read-only and will be permanently deleted on{" "}
            <strong>{org.deletionScheduledFor ? formatDate(org.deletionScheduledFor) : "—"}</strong>.
            Download your data before then.
          </p>
          <CancelDeletionButton />
        </Card>
      ) : (
        <Card title="Delete company">
          <div className="mb-4 space-y-2 text-sm text-muted-foreground">
            <p>
              The company becomes <strong>read-only</strong> straight away and is
              permanently deleted after {DELETION_GRACE_DAYS} days: every
              customer, order, invoice, payment, document and uploaded file,
              and the accounts of people who belong to no other company. You
              can cancel any time before then.
            </p>
            <p>Your Syncit subscription is cancelled now. Syncit keeps only the tax invoices it issued to you.</p>
          </div>
          <DeleteCompanyForm companyName={org.name} />
        </Card>
      )}
    </div>
  );
}
