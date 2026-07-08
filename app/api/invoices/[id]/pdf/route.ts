import { NextResponse } from "next/server";
import { requireProfileApi, canAccessParty } from "@/lib/authz";
import { db } from "@/lib/db";
import { buildInvoicePdf } from "@/lib/pdf/build";

export const dynamic = "force-dynamic";

// GET /api/invoices/:id/pdf — print-ready invoice PDF download.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { profile, failure } = await requireProfileApi();
  if (failure) return failure;

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    select: { party: { select: { assignedToId: true } } },
  });
  if (!invoice || !canAccessParty(profile, invoice.party)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await buildInvoicePdf(params.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
