import { NextResponse } from "next/server";
import { requireProfileApi, canAccessParty } from "@/lib/authz";
import { tenantDb } from "@/lib/tenant";
import { buildStatementPdf } from "@/lib/pdf/statement-build";
import { statementLinkUrl, STATEMENT_LINK_DAYS } from "@/lib/statement-link";

export const dynamic = "force-dynamic";

// SY29 — statement of account for one customer.
//
//   GET /api/parties/:id/statement          → the PDF (web "Statement" button)
//   GET /api/parties/:id/statement?link=1   → { url, expiresInDays } — a signed
//        7-day link the customer can open without signing in. The mobile
//        app calls this (Bearer token) and hands the link to the share sheet.
//
// Company and role come from the caller's active Membership; the
// customer is read through tenantDb, so another company's id is "Not
// found". STAFF only for customers assigned to them (same rule as the
// customer page and RLS).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { profile, failure } = await requireProfileApi();
  if (failure) return failure;
  if (profile.role === "FACTORY") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = tenantDb(profile.organizationId);

  const party = await db.party.findUnique({
    where: { id: params.id },
    select: { id: true, assignedToId: true },
  });
  if (!party || !canAccessParty(profile, party)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (new URL(request.url).searchParams.get("link") === "1") {
    try {
      return NextResponse.json(
        { url: statementLinkUrl(party.id), expiresInDays: STATEMENT_LINK_DAYS },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      // STATUS_LINK_SECRET missing or too short — fail closed.
      return NextResponse.json({ error: "Statement links are not set up." }, { status: 503 });
    }
  }

  const result = await buildStatementPdf(db, profile.organizationId, party.id);
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
