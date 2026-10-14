import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { captureError } from "@/lib/monitoring";
import { reviewLogin } from "@/lib/platform/review-login";

// SY37 — POST /api/auth/review-login { email, code }
//
// Sign-in for the three store-review accounts in the "Syncit Demo"
// company. All the rules live in lib/platform/review-login.ts; read the
// header there before changing anything. This handler only parses the
// body and keeps the answer uniform:
//
//   200 { access_token, refresh_token }   the review account's session
//   401 { error: "Invalid code." }        everything else — feature
//                                         off, any other email, wrong
//                                         code, locked out, account not
//                                         demo-only
//
// so it cannot be used to learn whether the feature is on or which
// addresses are review accounts. middleware.ts treats /api/auth/* as
// public and applies the per-IP burst cap.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/),
});

const refused = () => NextResponse.json({ error: "Invalid code." }, { status: 401 });

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return refused();
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return refused();

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  try {
    const result = await reviewLogin({
      email: parsed.data.email,
      code: parsed.data.code,
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
    if (!result.ok) {
      // A review address that passes the code but is not demo-only, or
      // whose session cannot be minted, is a setup fault worth a page.
      if (result.reason === "not_demo_only" || result.reason === "mint_failed") {
        await captureError(new Error(`review-login refused: ${result.reason}`), {
          where: "POST /api/auth/review-login",
          email: parsed.data.email,
        });
      }
      return refused();
    }
    return NextResponse.json(
      { access_token: result.accessToken, refresh_token: result.refreshToken },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    await captureError(e, { where: "POST /api/auth/review-login" });
    return refused();
  }
}
