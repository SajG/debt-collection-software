import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Routes that do NOT require a session.
// /signup used to live here; self-registration was removed. Users are
// now created only by an ADMIN (see /admin/users) or by the seed script.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/account-disabled",
  "/robots.txt",
]);
// /api/cron and /api/webhooks authenticate themselves (CRON_SECRET bearer,
// Meta verify token) — no browser session exists on those requests.
const PUBLIC_PREFIXES = [
  "/auth/",
  "/_next/",
  "/favicon",
  "/api/cron/",
  "/api/webhooks/",
  // Tally connector authenticates via `Authorization: Bearer TALLY_SYNC_SECRET`,
  // not a browser session — must bypass the login redirect.
  "/api/sync/",
  // F4 — customer-facing signed order-status link. The signed token
  // in the URL IS the auth; the page shows only status + docs for
  // that one order. Verified in lib/status-link.ts.
  "/status/",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// Constant-time compare so a network timer can't leak the token byte-by-byte.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const ACCESS_COOKIE = "sw_access";

export async function middleware(request: NextRequest) {
  // Must mutate supabaseResponse in the cookie setter below — don't use a const.
  let supabaseResponse = NextResponse.next({ request });

  // ── Optional site-wide access gate ────────────────────────────
  // Set SITE_ACCESS_TOKEN in env when the deployment is public-tunneled
  // for a pilot. Anyone without the token — including AI crawlers, URL
  // guessers, and bots — sees a plain 404 on every route, so the login
  // form itself is not enumerable. Share the bootstrap URL with real
  // users:  https://<host>/?access=<token>  → cookie is set, they can
  // then reach /login normally. Bearer-authed endpoints (cron, sync,
  // webhooks, signed status links) are exempt so the Tally connector
  // and webhook providers keep working.
  const accessToken = process.env.SITE_ACCESS_TOKEN;
  if (accessToken) {
    const { pathname } = request.nextUrl;
    const BEARER_BYPASS = [
      "/api/cron/",
      "/api/webhooks/",
      "/api/sync/",
      "/status/",
      "/_next/",
      "/favicon",
      "/robots.txt",
    ];
    const bypass = BEARER_BYPASS.some((p) => pathname.startsWith(p));
    if (!bypass) {
      const provided = request.nextUrl.searchParams.get("access");
      const cookieVal = request.cookies.get(ACCESS_COOKIE)?.value ?? "";
      const hasCookie = cookieVal && safeEqual(cookieVal, accessToken);
      const hasQuery = provided && safeEqual(provided, accessToken);
      if (hasQuery) {
        // Bootstrap: mint the cookie and strip ?access from the URL so it
        // doesn't leak via referrer / logs / shoulder-surfing.
        const clean = new URL(request.url);
        clean.searchParams.delete("access");
        const res = NextResponse.redirect(clean);
        res.cookies.set(ACCESS_COOKIE, accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
        return res;
      }
      if (!hasCookie) {
        // Plain 404 — not 401/403 — so the site is indistinguishable from
        // a dead host to anyone who doesn't already know the token.
        return new NextResponse("Not found", { status: 404 });
      }
    }
  }

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
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Security headers ──────────────────────────────────────────
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  // Block reputable AND AI crawlers even on the login page. Belt-and-
  // braces with app/robots.ts — scrapers that ignore robots.txt still
  // see this per-response directive.
  supabaseResponse.headers.set(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex",
  );
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
  // CSP — 'unsafe-eval' is only needed by Next.js in dev (React fast-
  // refresh uses eval); production builds don't. 'unsafe-inline' on
  // script-src stays for now because the App Router still emits an
  // inline hydration <script>; moving to a per-request nonce needs
  // a coordinated _document shim + strict-dynamic and is queued as a
  // follow-up. Both 'unsafe-*' on style-src are Tailwind's inline
  // style prop pattern — not attacker-reachable on their own.
  const isProd = process.env.NODE_ENV === "production";
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  supabaseResponse.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
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
