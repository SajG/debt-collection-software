import { requireAdmin } from "@/lib/authz";
import { PageHeader } from "../_components/ui";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  await requireAdmin();

  return (
    <div className="p-8">
      <PageHeader
        title="Import data"
        subtitle="Bring in parties and invoices from Tally, Zoho Books, or Excel via CSV export."
      />
      <ImportClient />
    </div>
  );
}
