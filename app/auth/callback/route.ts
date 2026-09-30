import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db";

// SY23 — OAuth / magic-link return leg.
//
// Exchanges the `code` for a session, then:
//   * Brand-new Google users get a stub Profile so /onboarding has
//     something to render.
//   * Members of one org get active_org_id pinned in the JWT.
//   * Users with no active Membership land on /onboarding; everyone
//     else on the requested `next` (defaults /dashboard).
//
// `next` is honoured only when it starts with `/` — an off-domain
// value is discarded so a hostile callback cannot bounce elsewhere.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

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

  const existing = await db.profile.findUnique({ where: { id: user.id } });
  if (!existing) {
    const displayName =
      (user.user_metadata?.name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "Owner";
    await db.profile.create({
      data: {
        id: user.id,
        businessName: "",
        ownerName: displayName,
        email: user.email ?? null,
        role: "ADMIN",
        isActive: true,
      },
    });
  }

  const memberships = await db.membership.findMany({
    where: { profileId: user.id, isActive: true },
    select: { organizationId: true },
    take: 2,
  });

  if (memberships.length >= 1) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata ?? {}),
        active_org_id: memberships[0].organizationId,
      },
    });
  }

  cookieStore.set("syncit_auth_since", String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  const dest = memberships.length === 0 ? "/onboarding" : next;
  return NextResponse.redirect(`${origin}${dest}`);
}
