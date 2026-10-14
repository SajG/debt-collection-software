import { NextResponse } from "next/server";
import { getHealth } from "@/lib/platform/health";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// SY40 — GET /api/health. Public, for the uptime monitor and /status.
//   200  everything answers
//   503  database, sign-in or email is not answering
// Body: { status, checks: { database, auth, email }, checkedAt } with
// ok + latency only. Cached 30 s per instance (lib/platform/health.ts).
export async function GET() {
  const health = await getHealth();
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export async function HEAD() {
  const health = await getHealth();
  return new NextResponse(null, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
