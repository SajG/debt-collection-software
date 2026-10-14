import { NextResponse } from "next/server";
import { tenantDb } from "@/lib/tenant";
import { findPartyOrg } from "@/lib/platform/resolve";
import { verifyStatementToken } from "@/lib/statement-link";
import { buildStatementPdf } from "@/lib/pdf/statement-build";
import { captureError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

// SY29 — GET /statement/:token — the customer-facing statement PDF.
// No login: the signed, 7-day token IS the authorisation
// (lib/statement-link.ts). It names exactly one customer; the response
// is that customer's ledger and nothing else. A bad, forged or expired
// token gets the same short plain-text answer, so the route never says
// whether a customer id exists.

function refuse(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const verified = verifyStatementToken(decodeURIComponent(params.token));
  if (!verified.ok) {
    return verified.reason === "expired"
      ? refuse("This statement link has expired. Please ask for a fresh one.", 410)
      : refuse("This link is not valid.", 404);
  }

  const organizationId = await findPartyOrg(verified.partyId);
  if (!organizationId) return refuse("This link is not valid.", 404);

  try {
    const result = await buildStatementPdf(tenantDb(organizationId), organizationId, verified.partyId);
    if ("error" in result) return refuse("This link is not valid.", 404);
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    await captureError(e, { scope: "statement.public" });
    return refuse("The statement could not be prepared. Please try again.", 500);
  }
}
