// Supabase Edge Function: enroll-device
//
// Redeems a Syncit enrollment code and mints a magic-link token the
// mobile app immediately verifies to get a session. Runs on the
// Supabase edge so mobile does not need to know a separate Vercel
// URL — the app already has SUPABASE_URL baked in via
// EXPO_PUBLIC_SUPABASE_URL.
//
// Deploy with:
//   supabase functions deploy enroll-device --no-verify-jwt
//
// Anon-callable BY DESIGN. Every safety check runs inside the RPC
// (rate limit, hash compare, phone match, isActive). Same generic
// error for every failure branch — no oracle for wrong-code vs
// unknown-phone.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GENERIC_ERROR = "Enrollment failed. Ask your admin for a new code.";

function normalisePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

function syntheticEmailFor(profileId: string): string {
  return `${profileId}@device.paytrack.local`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: GENERIC_ERROR }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: GENERIC_ERROR }, 400);
  }

  const phone = normalisePhone(body.phone);
  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : null;
  if (!phone || !code || code.length !== 8) {
    return json({ error: GENERIC_ERROR }, 400);
  }
  const device = {
    label:
      typeof body?.device?.label === "string"
        ? String(body.device.label).slice(0, 80)
        : "Unnamed device",
    platform:
      typeof body?.device?.platform === "string"
        ? String(body.device.platform).slice(0, 20)
        : "unknown",
    osVersion:
      typeof body?.device?.osVersion === "string"
        ? String(body.device.osVersion).slice(0, 40)
        : null,
    appVersion:
      typeof body?.device?.appVersion === "string"
        ? String(body.device.appVersion).slice(0, 40)
        : null,
  };

  // 1. Redeem the code. RPC does rate limit, hash compare, phone
  //    match, isActive, and inserts the Device row.
  const { data: rows, error: redeemErr } = await admin.rpc(
    "redeem_enrollment_code",
    { p_phone: phone, p_code: code, p_device: device },
  );
  if (
    redeemErr ||
    !rows ||
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    return json({ error: GENERIC_ERROR }, 400);
  }
  const row = rows[0] as { profile_id: string; device_id: string };

  // 2. Ensure the user has a synthetic email — magiclink needs one.
  //    Idempotent update; safe to re-run.
  const desiredEmail = syntheticEmailFor(row.profile_id);
  const { data: userRow, error: getErr } = await admin.auth.admin.getUserById(
    row.profile_id,
  );
  if (getErr || !userRow?.user) return json({ error: GENERIC_ERROR }, 500);
  const currentEmail = userRow.user.email ?? "";
  if (currentEmail.toLowerCase() !== desiredEmail.toLowerCase()) {
    const { error: setErr } = await admin.auth.admin.updateUserById(
      row.profile_id,
      { email: desiredEmail, email_confirm: true },
    );
    if (setErr) return json({ error: GENERIC_ERROR }, 500);
  }

  // 3. Global sign-out first so any lingering JWT from a device
  //    revoked by step 1 dies immediately.
  await admin.auth.admin
    .signOut(row.profile_id, "global")
    .catch(() => undefined);

  // 4. Mint a magic link and hand the hashed_token to the client.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: desiredEmail,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return json({ error: GENERIC_ERROR }, 500);
  }

  return json({
    email: desiredEmail,
    hashedToken: link.properties.hashed_token,
    deviceId: row.device_id,
    profileId: row.profile_id,
  });
});
