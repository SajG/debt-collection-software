import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { posthogConfig } from "@/lib/analytics-events/posthog";

// SY38 — POST /api/t — page views from the public marketing site.
//
// The browser talks only to us (first party: no third-party script, no
// change to the Content-Security-Policy); this route forwards a
// $pageview to PostHog. It accepts three things — a path on this site,
// a referring HOST, and a visitor id the page made up — and discards
// everything else. It does not forward the visitor's IP address and
// turns PostHog's location lookup off.
//
// Before the visitor accepts analytics the page sends a fresh random id
// on every page load and stores nothing (no cookie, no localStorage),
// and the event is marked so PostHog creates no person profile. After
// they accept, the id is kept in localStorage so visits can be joined.
// See components/analytics/pageview.tsx.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  path: z.string().max(200).regex(/^\/[A-Za-z0-9/_.\-[\]]*$/),
  referrerHost: z.string().max(100).regex(/^[A-Za-z0-9.-]*$/).optional(),
  id: z.string().regex(/^[a-f0-9-]{36}$/),
  consented: z.boolean(),
});

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  const cfg = posthogConfig();
  if (!cfg) return NO_CONTENT();

  // Only our own pages may report views.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NO_CONTENT();

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NO_CONTENT();
  }
  if (!parsed.success) return NO_CONTENT();
  const { path, referrerHost, id, consented } = parsed.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(`${cfg.host}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify({
        api_key: cfg.key,
        event: "$pageview",
        distinct_id: id,
        properties: {
          $current_url: `https://getsyncit.app${path}`,
          $pathname: path,
          ...(referrerHost ? { $referring_domain: referrerHost } : {}),
          $geoip_disable: true,
          $process_person_profile: consented,
          $lib: "syncit-web",
        },
      }),
    });
  } catch {
    /* analytics never surfaces an error */
  } finally {
    clearTimeout(timer);
  }
  return NO_CONTENT();
}
