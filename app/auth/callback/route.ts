import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { pinActiveOrgClaim } from "@/lib/platform/active-org";
import { ensureStubProfile } from "@/lib/platform/resolve";
import { safePath } from "@/lib/safe-redirect";

// SY23 — OAuth / magic-link return leg.
//
// Exchanges the `code` for a session, then:
//   * Brand-new Google users get a stub Profile (role STAFF — the
//     lowest; the real role lives on the Membership they get when
//     they create or join a company) so /onboarding has something to
//     render.
//   * active_org_id is pinned to one of their own memberships.
//   * Users with no active Membership land on /onboarding; everyone
//     else on the requested `next` (defaults /dashboard).
//
// `next` goes through safePath() — "//evil.com" and friends fall back
// to /dashboard so a hostile link cannot bounce off-domain.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next"), "/dashboard");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }
  const user = data.user;

  await ensureStubProfile(user);

  const { membershipCount } = await pinActiveOrgClaim(user);

  cookieStore.set("syncit_auth_since", String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  const dest = membershipCount === 0 ? "/onboarding" : next;
  return NextResponse.redirect(`${origin}${dest}`);
}
