import { NextResponse } from "next/server";

// CSP violation sink. Anon-callable BY DESIGN — browsers post here
// without credentials whenever the CSP blocks something. The report
// body is attacker-controllable (any string in the blocked-uri /
// script-sample fields), so:
//
//   * we never persist it beyond the log line
//   * we clamp field lengths so a hostile page cannot balloon our
//     log volume
//   * we do not echo the body back to the caller
//
// The purpose is to catch OUR OWN regressions — a next-font update
// that emits an unnonced style, an npm dep pulling a CDN URL, a
// third-party SDK trying to eval. Real XSS reports would arrive
// here too if an attacker chained through a policy hole, but that
// case is rare compared to the noise of accidental first-party
// violations. Filter accordingly.

type CspBody =
  | {
      "csp-report"?: Record<string, unknown>;
    }
  | Record<string, unknown>;

const CLAMP = 400;

function clip(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > CLAMP ? `${s.slice(0, CLAMP)}…` : s;
}

export async function POST(req: Request) {
  let body: CspBody = {};
  try {
    body = (await req.json()) as CspBody;
  } catch {
    // Some browsers still POST the legacy form-encoded body. Ignore.
  }

  // Chrome / Firefox / Edge send either the legacy `csp-report`
  // wrapper or the newer flat `report` shape via Reporting API. Pick
  // whichever is present.
  const report =
    (body as { "csp-report"?: Record<string, unknown> })["csp-report"] ??
    (body as Record<string, unknown>);

  const directive = clip(report?.["violated-directive"] ?? report?.effectiveDirective);
  const blocked = clip(report?.["blocked-uri"] ?? report?.blockedURL);
  const source = clip(report?.["source-file"] ?? report?.sourceFile);
  const line = clip(report?.["line-number"] ?? report?.lineNumber);
  const sample = clip(report?.["script-sample"] ?? report?.sample);
  const referrer = clip(report?.["document-uri"] ?? report?.documentURL);
  const ua = clip(req.headers.get("user-agent") ?? "");

  // One structured line. Prefer server logs over the DB — CSP
  // reports are noisy at any scale and any persistence path becomes
  // an attacker-controlled write surface.
  //
  // Do not log the report referrer's query string or the raw sample
  // if either exceeds CLAMP; the clip() above already caps.
  console.warn(
    "[csp-report]",
    JSON.stringify({
      directive,
      blocked,
      source,
      line,
      sample,
      referrer,
      ua,
    }),
  );

  // 204 — nothing to say, nothing to leak.
  return new NextResponse(null, { status: 204 });
}
