import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireProfileApi } from "@/lib/authz";
import {
  PROVIDER_BY_SLUG,
  authorizeUrl,
  providerConfigured,
  type ProviderSlug,
} from "@/lib/integrations/accounting";

export const dynamic = "force-dynamic";

// GET /api/integrations/:provider/connect — admin only. Sets a CSRF state
// cookie and redirects to the provider's OAuth consent screen.
export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const { failure } = await requireProfileApi({ adminOnly: true });
  if (failure) return failure;

  const provider = PROVIDER_BY_SLUG[params.provider as ProviderSlug];
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  if (!providerConfigured(provider)) {
    return NextResponse.redirect(
      new URL(`/import?sync_error=${params.provider}-not-configured`, request.url)
    );
  }

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    authorizeUrl(provider, params.provider as ProviderSlug, request.nextUrl.origin, state)
  );
  response.cookies.set(`oauth_state_${params.provider}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
