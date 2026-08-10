import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Routes that do NOT require a session
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  // Public legal pages
  "/terms",
  "/privacy",
  "/refund-policy",
  "/cancellation-policy",
  "/data-policy",
  // SEO / branding assets served by app-router file conventions
  "/sitemap.xml",
  "/robots.txt",
  "/opengraph-image",
  "/apple-icon",
  "/manifest.webmanifest",
]);
// /api/cron and /api/webhooks authenticate themselves (CRON_SECRET bearer,
// Meta verify token) — no browser session exists on those requests.
const PUBLIC_PREFIXES = [
  "/auth/",
  "/_next/",
  "/favicon",
  "/api/cron/",
  "/api/webhooks/",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  // Must mutate supabaseResponse in the cookie setter below — don't use a const.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Propagate updated cookies to both the request and the response.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not add code between createServerClient and getUser().
  // A subtle error here causes random session loss.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect unauthenticated users to /login with callbackUrl preserved.
  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged-in users don't need to see the auth pages.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Security headers ──────────────────────────────────────────
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  supabaseResponse.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  supabaseResponse.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  supabaseResponse.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  supabaseResponse.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} wss://*.supabase.co`,
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // IMPORTANT: must return supabaseResponse (not a new NextResponse) so the
  // updated session cookies are forwarded to the browser.
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
