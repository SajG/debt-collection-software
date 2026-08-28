import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/auth/enroll — device enrollment.
//
// Anon-callable. The user does not have a session yet; every check
// runs on the server. Flow:
//
//   1. Client posts { phone, code, device }.
//   2. Server calls redeem_enrollment_code(...) RPC. That function
//      does rate-limit, hash compare, expiry, consumption, phone
//      match, profile.isActive, and (if all pass) inserts a Device
//      row, marks the code consumed, revokes any prior device, and
//      writes an audit log — see the migration for the invariants.
//   3. Server mints a session for the returned profile_id via
//      admin.generateLink({ type: 'magiclink' }) and returns the
//      hashed_token + email to the client, which calls verifyOtp()
//      to complete sign-in.
//   4. Server also calls admin.signOut(profile_id, "global") BEFORE
//      generating the fresh link so any surviving JWT from a
//      revoked-in-step-2 prior device dies immediately.
//
// Failure surface is deliberately narrow: any error returns 400 with
// a generic message. The real reason lives in Postgres logs and the
// audit table; we do not distinguish "wrong code" from "rate limited"
// from "unknown phone" over the wire.

const GENERIC_ERROR = "Enrollment failed. Ask your admin for a new code.";

// Every "device.paytrack.local" email is server-owned and undeliverable
// by design — it exists only to give Supabase auth.users an email
// handle so admin.generateLink({ type: 'magiclink' }) has something to
// send to. Nothing is ever mailed to it.
function syntheticEmailFor(profileId: string): string {
  return `${profileId}@device.paytrack.local`;
}

type EnrollBody = {
  phone?: unknown;
  code?: unknown;
  device?: {
    label?: unknown;
    platform?: unknown;
    osVersion?: unknown;
    appVersion?: unknown;
  };
};

function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

export async function POST(req: Request) {
  let body: EnrollBody;
  try {
    body = (await req.json()) as EnrollBody;
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const phone = normalisePhone(body.phone);
  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : null;
  if (!phone || !code || code.length !== 8) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const device = {
    label:
      typeof body.device?.label === "string"
        ? body.device.label.slice(0, 80)
        : "Unnamed device",
    platform:
      typeof body.device?.platform === "string"
        ? body.device.platform.slice(0, 20)
        : "unknown",
    osVersion:
      typeof body.device?.osVersion === "string"
        ? body.device.osVersion.slice(0, 40)
        : null,
    appVersion:
      typeof body.device?.appVersion === "string"
        ? body.device.appVersion.slice(0, 40)
        : null,
  };

  const admin = createAdminClient();

  // Step 1: redeem. The RPC returns (profile_id, device_id).
  const { data: redeemRows, error: redeemErr } = await admin.rpc(
    "redeem_enrollment_code",
    { p_phone: phone, p_code: code, p_device: device },
  );
  if (redeemErr || !redeemRows || !Array.isArray(redeemRows) || redeemRows.length === 0) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  const row = redeemRows[0] as { profile_id: string; device_id: string };
  const profileId = row.profile_id;
  const deviceId = row.device_id;

  // Step 2: attach or reuse a synthetic email so magiclink has a
  // handle. Idempotent — updateUserById is a no-op if the email is
  // already correct.
  const desiredEmail = syntheticEmailFor(profileId);
  const { data: userRow, error: getErr } = await admin.auth.admin.getUserById(
    profileId,
  );
  if (getErr || !userRow?.user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  const currentEmail = userRow.user.email ?? "";
  if (currentEmail.toLowerCase() !== desiredEmail.toLowerCase()) {
    const { error: setEmailErr } = await admin.auth.admin.updateUserById(
      profileId,
      { email: desiredEmail, email_confirm: true },
    );
    if (setEmailErr) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }
  }

  // Step 3: global sign-out first — any prior device that was revoked
  // in step 1 loses its live JWT here, so the small window between
  // "device revoked in DB" and "next request rejected" closes.
  await admin.auth.admin.signOut(profileId, "global").catch(() => {
    /* non-fatal — user may have had no active sessions */
  });

  // Step 4: generate a magiclink; extract the hashed_token so the
  // client can complete verifyOtp() without an email ever being sent.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: desiredEmail,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // The client uses `verifyOtp({ email, token, type: 'magiclink' })`
  // with what we return here. That call yields the actual session.
  return NextResponse.json({
    email: desiredEmail,
    hashedToken: link.properties.hashed_token,
    deviceId,
    profileId,
  });
}
