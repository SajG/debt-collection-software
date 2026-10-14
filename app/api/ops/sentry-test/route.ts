import { NextResponse, type NextRequest } from "next/server";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import { captureError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

// SY40 — GET /api/ops/sentry-test with `Authorization: Bearer $CRON_SECRET`.
// Reports one deliberate error to Sentry so the alert rules can be
// proven end to end (docs/RUNBOOK.md → "Prove the alerts work").
//
// Each call uses a new message, so Sentry treats it as a NEW issue and
// the "new issue" alert fires every time. In production it also needs
// ?confirm=production, so it is not triggered there by accident.
export async function GET(request: NextRequest) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
  if (env === "production" && request.nextUrl.searchParams.get("confirm") !== "production") {
    return NextResponse.json({ error: "Add ?confirm=production to send a test error from production." }, { status: 400 });
  }
  const stamp = new Date().toISOString();
  await captureError(new Error(`Syncit alert test ${stamp} (${env}) — safe to resolve`), {
    scope: "ops.sentry-test",
    environment: env,
  });
  return NextResponse.json(
    { sent: Boolean(process.env.SENTRY_DSN), environment: env, at: stamp },
    { status: process.env.SENTRY_DSN ? 200 : 503 },
  );
}
