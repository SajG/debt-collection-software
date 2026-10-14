import { NextResponse } from "next/server";
import { requireProfileApi } from "@/lib/authz";
import { syncMilestones } from "@/lib/platform/milestones";

export const dynamic = "force-dynamic";

// SY38 — POST /api/mobile/milestones
//
// The phone places orders and records payments straight through
// Supabase, so the web server never sees them. After a successful save
// the app pings this route; the server looks at the caller's own
// company (from Membership — the request body is ignored) and records
// any milestone it has newly reached, which sends first_order_placed /
// first_payment_recorded to PostHog exactly once per company. If the
// ping is lost, the daily lifecycle cron catches up.
export async function POST(request: Request) {
  const { profile, failure } = await requireProfileApi({
    bearer: request.headers.get("authorization"),
  });
  if (failure) return failure;
  const fresh = await syncMilestones(profile.organizationId, {
    actorId: profile.id,
    source: "mobile",
  }).catch(() => []);
  return NextResponse.json({ ok: true, recorded: fresh.length }, { headers: { "Cache-Control": "no-store" } });
}
