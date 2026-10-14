import { NextResponse, type NextRequest } from "next/server";
import { normaliseReferralCode, referralCodeExists } from "@/lib/platform/referrals";

export const dynamic = "force-dynamic";

// SY38 — /r/<code> — a company's "Invite another business" link.
// Sends the visitor to sign-up with the code in the address (no
// cookie). An unknown or malformed code lands on plain sign-up, so the
// link never dead-ends and never confirms whether a code exists.
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = normaliseReferralCode(params.code);
  const target = new URL("/signup", request.url);
  try {
    if (code && (await referralCodeExists(code))) target.searchParams.set("ref", code);
  } catch {
    // A lookup failure must not strand someone who was invited.
  }
  return NextResponse.redirect(target, { status: 302, headers: { "X-Robots-Tag": "noindex" } });
}
