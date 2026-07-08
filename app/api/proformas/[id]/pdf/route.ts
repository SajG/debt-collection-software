import { NextResponse } from "next/server";
import { requireProfileApi, canAccessParty } from "@/lib/authz";
import { db } from "@/lib/db";
import { buildProformaPdf } from "@/lib/pdf/build";

export const dynamic = "force-dynamic";

// GET /api/proformas/:id/pdf — print-ready proforma PDF download.
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { profile, failure } = await requireProfileApi();
  if (failure) return failure;

  const proforma = await db.proformaInvoice.findUnique({
    where: { id: params.id },
    select: { party: { select: { assignedToId: true } } },
  });
  if (!proforma || !canAccessParty(profile, proforma.party)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await buildProformaPdf(params.id);
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
