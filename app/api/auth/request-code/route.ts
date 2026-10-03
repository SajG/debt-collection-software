import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/monitoring";
import {
  checkEmailOtpSendLimit,
  recordLoginAttempt,
} from "@/lib/platform/rate-limit";

// Mobile calls THIS route for a 6-digit email code (SY-email + audit
// item 9). Previously the mobile client hit supabase.auth.signInWithOtp
// directly, which bypassed our server-side per-email rate limit
// (checkEmailOtpSendLimit) — a hostile client could spam the Supabase
// SMTP bucket for a known address and burn the shared 3-per-15-min
// budget for every mobile signer.
//
// Response is uniform: ALWAYS { ok: true } for anything that isn't a
// malformed body or a rate-limit hit (SY15.8, no enumeration oracle).
// Supabase / SMTP faults are logged server-side but never leaked to
// the caller. Rate-limit is the one exception — attacker learns only
// their own limit.
//
// Middleware.ts marks /api/auth/* public (unauthenticated by design)
// and applies its per-IP burst cap on top of the per-email limit.

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  const { email } = parsed.data;

  const { limited, retryAfterMinutes } = await checkEmailOtpSendLimit(email);
  if (limited) {
    return NextResponse.json(
      {
        error: `Too many code requests. Try again in ${retryAfterMinutes} minutes.`,
      },
      { status: 429 },
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    await captureError(error, {
      where: "POST /api/auth/request-code",
      supabaseMessage: error.message,
    });
  }
  await recordLoginAttempt(email, !error, "EMAIL_OTP");

  return NextResponse.json({ ok: true });
}
