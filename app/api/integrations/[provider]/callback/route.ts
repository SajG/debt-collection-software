import { NextResponse, type NextRequest } from "next/server";
import { requireProfileApi } from "@/lib/authz";
import {
  PROVIDER_BY_SLUG,
  exchangeCode,
  discoverOrgId,
  saveConnection,
  type ProviderSlug,
} from "@/lib/integrations/accounting";

export const dynamic = "force-dynamic";

// GET /api/integrations/:provider/callback — OAuth redirect target.
// Verifies the CSRF state cookie, exchanges the code, stores encrypted
// tokens, and bounces back to /import.
export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const { failure } = await requireProfileApi({ adminOnly: true });
  if (failure) return failure;

  const slug = params.provider as ProviderSlug;
  const provider = PROVIDER_BY_SLUG[slug];
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const back = (query: string) => {
    const res = NextResponse.redirect(new URL(`/import?${query}`, request.url));
    res.cookies.delete(`oauth_state_${slug}`);
    return res;
  };

  const search = request.nextUrl.searchParams;
  const code = search.get("code");
  const state = search.get("state");
  const expectedState = request.cookies.get(`oauth_state_${slug}`)?.value;

  if (search.get("error")) return back(`sync_error=${search.get("error")}`);
  if (!code || !state || !expectedState || state !== expectedState) {
    return back("sync_error=state-mismatch");
  }

  const tokens = await exchangeCode(provider, slug, request.nextUrl.origin, code);
  if (!tokens.access_token || !tokens.refresh_token) {
    return back(`sync_error=${encodeURIComponent(tokens.error ?? "token-exchange-failed")}`);
  }

  // QuickBooks hands the tenant over on the callback; Xero/Zoho need a lookup.
  const externalOrgId =
    provider === "QUICKBOOKS"
      ? search.get("realmId")
      : await discoverOrgId(provider, tokens.access_token);

  await saveConnection({ provider, tokens, externalOrgId });
  return back(`connected=${slug}`);
}
