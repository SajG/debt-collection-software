import { redirect } from "next/navigation";

// The old rate-only approval queue was folded into /admin/approvals
// (P1). Kept as a permanent redirect so bookmarks and audit-log
// references from earlier releases still land on the right screen.
export default function RateApprovalsRedirect(): never {
  redirect("/admin/approvals");
}
