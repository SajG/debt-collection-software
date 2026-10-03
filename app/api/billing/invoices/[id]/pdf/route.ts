import { NextResponse } from "next/server";
import { findBillingInvoice } from "@/lib/platform/billing";
import { requireMembership } from "@/lib/tenant";
import { renderBillingInvoicePdf } from "@/lib/pdf/billing-invoice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/billing/invoices/:id/pdf — Syncit GST invoice, owner only.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await requireMembership();
  if (!ctx.isOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inv = await findBillingInvoice(ctx.organizationId, params.id);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderBillingInvoicePdf(inv);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${inv.invoiceNumber.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
