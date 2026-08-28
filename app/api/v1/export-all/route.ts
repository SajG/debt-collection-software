import { NextResponse } from "next/server";

// Honeypot. Explicitly Disallowed in app/robots.ts. The endpoint
// name sounds like the sort of thing an attacker would guess — a
// bulk data export — but never appears anywhere legitimate. There
// is no reason a real user, real integration, or real crawler
// would ever hit this URL.
//
// Any GET / POST here is by definition a scan. We:
//
//   1. Log a structured line with the caller's IP, path, UA, and
//      any Authorization header shape (never the value). This is
//      the signal — a spike here means someone is walking the
//      route table.
//   2. Return a plain 404, indistinguishable from a missing route,
//      so the scanner cannot tell they found something.
//
// Do NOT wire this to Sentry directly — a bot loop would burn our
// Sentry quota. The server log line is enough for a human to
// notice via Vercel logs or a scheduled log-drain query.

function scanReport(req: Request): void {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const auth = req.headers.get("authorization");
  const authShape = auth
    ? auth.startsWith("Bearer ")
      ? "bearer"
      : auth.startsWith("Basic ")
        ? "basic"
        : "other"
    : "none";
  console.warn(
    "[honeypot]",
    JSON.stringify({
      ip,
      method: req.method,
      path: new URL(req.url).pathname,
      ua,
      authShape,
    }),
  );
}

function notFound(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(req: Request) {
  scanReport(req);
  return notFound();
}
export async function POST(req: Request) {
  scanReport(req);
  return notFound();
}
export async function PUT(req: Request) {
  scanReport(req);
  return notFound();
}
export async function DELETE(req: Request) {
  scanReport(req);
  return notFound();
}
