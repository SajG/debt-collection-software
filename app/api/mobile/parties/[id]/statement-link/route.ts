import { NextResponse } from "next/server";
import { requireProfileApi, canAccessParty } from "@/lib/authz";
import { tenantDb } from "@/lib/tenant";
import { statementLinkUrl, STATEMENT_LINK_DAYS } from "@/lib/statement-link";

export const dynamic = "force-dynamic";

// SY29 — GET /api/mobile/parties/:id/statement-link
//
// The phone asks for a signed 7-day statement link for one customer and
// hands it (or the PDF behind it) to the share sheet. Auth is the app's
// Supabase access token; company and role come from Membership. STAFF
// only for customers assigned to them; FACTORY never.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { profile, failure } = await requireProfileApi({
    bearer: request.headers.get("authorization"),
  });
  if (failure) return failure;
  if (profile.role === "FACTORY") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const party = await tenantDb(profile.organizationId).party.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, assignedToId: true },
  });
  if (!party || !canAccessParty(profile, party)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    return NextResponse.json(
      { url: statementLinkUrl(party.id), expiresInDays: STATEMENT_LINK_DAYS, customer: party.name },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Statement links are not set up." }, { status: 503 });
  }
}
