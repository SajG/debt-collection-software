import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Routes that do NOT require a session.
// /signup is listed pre-emptively — no self-registration page exists
// yet (SY23). If someone hits it today they get a 404 without a login
// bounce, which matches the future intent.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/features",
  "/tally",
  "/download",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/contact",
  "/account-disabled",
  "/robots.txt",
  "/sitemap.xml",
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
  // Anonymous — the browser POSTs violation reports here with no
  // credentials; we accept, log, and drop the body's PII.
  "/api/csp-report",
  // Mobile sign-in — POST /api/auth/request-code carries no session.
  // Rate-gated by the per-IP bucket above + per-email limit inside
  // the route handler; the response is uniform {ok:true} regardless
  // of allowlist state (SY15.8, no enumeration oracle).
  "/api/auth/",
  // /api/session/active-org verifies the caller's session itself
  // before switching orgs (SY22). Middleware bounce isn't needed.
  "/api/session/",
  // Honeypot — must reach its own 404 handler so the alert line
  // fires with full request metadata. Redirecting to /login would
  // still leave a trail in access logs but hide the shape of the
  // scan.
  "/api/v1/",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // /login sub-flows (/login/email-code, /login/password) must be
  // reachable while signed out — otherwise the redirect from /login
  // loops back to /login. /login/challenge is the exception: it is
  // the aal1 → aal2 TOTP step and MUST require a session; a signed-
  // out hit falls through to the redirect below.
  if (pathname.startsWith("/login/") && pathname !== "/login/challenge") {
    return true;
  }
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// ── Best-effort edge rate limiter ─────────────────────────────────
// Middleware runs in V8 isolates on Vercel Edge. Globals survive
// across requests within one isolate; isolates are recycled and
// geo-distributed. So this bucket catches a single-source flood
// hitting one region — the correct defence against a distributed
// attack is Vercel's Attack Challenge Mode (dashboard toggle).
// SECURITY.md explains the split.
//
// Buckets are keyed by IP + coarse route (login vs auth-api) and
// hold a rolling 60-second window count. When the count exceeds
// LIMIT the request gets a 429.
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;

type Bucket = { count: number; windowStart: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rateBuckets: Map<string, Bucket> =
  ((globalThis as any).__syncitRate ??=
    new Map<string, Bucket>()) as Map<string, Bucket>;

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function overRateLimit(key: string): boolean {
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || now - existing.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now });
    // Bound map size so a churn of unique IPs (a scan) doesn't
    // balloon isolate memory. 10k entries × ~64 B ≈ 640 KB max.
    if (rateBuckets.size > 10_000) {
      const cutoff = now - RATE_WINDOW_MS;
      rateBuckets.forEach((v, k) => {
        if (v.windowStart < cutoff && rateBuckets.size > 8_000) {
          rateBuckets.delete(k);
        }
      });
    }
    return false;
  }
  existing.count += 1;
  return existing.count > RATE_LIMIT;
}

/** Base64url nonce, 16 bytes. Regenerated per request. Web Crypto is
 *  available on the Edge runtime; no Buffer dependency. */
function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function middleware(request: NextRequest) {
  const { pathname: pathnameForRate } = request.nextUrl;

  // Rate limit /login (and its sub-paths — /login/email-code,
  // /login/challenge) plus every /api/auth/* endpoint per IP per
  // minute. Bearer-authed and cron endpoints skip this — they
  // authenticate on their own and are not scan targets in the same
  // way. See RATE_LIMIT above.
  const isRateGated =
    pathnameForRate === "/login" ||
    pathnameForRate.startsWith("/login/") ||
    pathnameForRate.startsWith("/api/auth/");
  if (isRateGated) {
    const bucket = `${clientIp(request)}::${
      pathnameForRate.startsWith("/login") ? "login" : "auth"
    }`;
    if (overRateLimit(bucket)) {
      // 429 with Retry-After so a well-behaved client backs off.
      return new NextResponse("Too many requests", {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)),
          "cache-control": "no-store",
        },
      });
    }
  }

  // Per-request nonce. Passed to server components via a request
  // header so app/layout.tsx can read headers().get("x-nonce") and
  // attach it to any inline <script>. Next.js also picks it up
  // automatically for its own hydration script when the CSP
  // includes `nonce-<value>` + `strict-dynamic`.
  const nonce = makeNonce();

  // Rewrite the request with the nonce header so server components
  // downstream see it via headers(). This shape mirrors Next's
  // recommended CSP nonce pattern.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Must mutate supabaseResponse in the cookie setter below — don't use a const.
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Site-wide access gate — REMOVED (SY7). Was a single shared
  // SITE_ACCESS_TOKEN cookie with no per-person revocation. Replaced
  // by Vercel deployment protection (Vercel Auth / password protection
  // at the platform layer). See SECURITY.md for the reasoning.

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
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
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

  // Absolute session floor (SY7). Independent of Supabase's refresh
  // TTL — even a daily-active user gets bounced after 90 days.
  // Stamp lives in an httpOnly cookie set on first successful
  // login; we compare on every request and force sign-out if past
  // the cap. The cookie is opaque; a client cannot extend it.
  const ABSOLUTE_MAX_MS = 90 * 24 * 60 * 60 * 1000;
  if (user) {
    const authSinceCookie = request.cookies.get("syncit_auth_since")?.value;
    const authSince = authSinceCookie ? Number(authSinceCookie) : NaN;
    if (Number.isFinite(authSince) && Date.now() - authSince > ABSOLUTE_MAX_MS) {
      await supabase.auth.signOut();
      const url = new URL("/login", request.url);
      url.searchParams.set("callbackUrl", pathname);
      const bounce = NextResponse.redirect(url);
      bounce.cookies.delete("syncit_auth_since");
      return bounce;
    }
  }

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

  // Also mirror the nonce onto the response header so downstream
  // instrumentation (e.g. Vercel logs) can correlate a specific
  // violation report back to the request that emitted the page.
  supabaseResponse.headers.set("x-nonce", nonce);

  // ── Security headers ──────────────────────────────────────────
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  // Block reputable AND AI crawlers even on the login page. Belt-and-
  // braces with app/robots.ts — scrapers that ignore robots.txt still
  // see this per-response directive.
  supabaseResponse.headers.set(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai",
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

  // Cache-Control (SY8). Every request that reaches middleware is
  // either authenticated (has a Supabase session) or one of the
  // few genuinely public surfaces. Both cases refuse a shared
  // cache — the authenticated one because a proxy caching an
  // order or invoice HTML page would cross-serve it; the public
  // ones because they're status pages with signed URLs whose
  // freshness must be honoured. Everything static (fonts, CSS,
  // Next chunks) is served from /_next/ which the matcher
  // excludes, so those keep their long-lived caches.
  supabaseResponse.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );

  // CSP — SY7 rewrite.
  //
  //   * script-src drops 'unsafe-inline'. Every inline script that
  //     the App Router emits (hydration bootstrap, next/font style
  //     inlining, next/script) carries the request nonce via Next's
  //     built-in nonce inheritance. `strict-dynamic` lets scripts
  //     loaded by a nonced script inherit trust — this covers
  //     third-party bundles Next split-loads.
  //   * 'unsafe-eval' remains ONLY in dev (React fast-refresh); the
  //     production build never needs it.
  //   * style-src still permits 'unsafe-inline' — Tailwind emits
  //     inline styles on the html element and there is no XSS
  //     surface via style alone.
  //   * report-uri points at our /api/csp-report route which
  //     writes-through to Sentry / server logs.
  const isProd = process.env.NODE_ENV === "production";
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;

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
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "report-uri /api/csp-report",
      // Chrome ignores report-uri when report-to is present, but
      // both are cheap to include and Firefox needs report-uri.
      "report-to csp-endpoint",
    ].join("; ")
  );
  supabaseResponse.headers.set(
    "Reporting-Endpoints",
    'csp-endpoint="/api/csp-report"',
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
