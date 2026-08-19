import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, expiring, read-only tokens for the customer-facing order-
// status page (F4). Never leaks anything except status + docs; every
// verification is timing-safe.
//
// Token shape: base64url(orderId).base64url(expiryEpochMs).hex(hmac)
// The HMAC covers `${orderId}:${expiryEpochMs}` using STATUS_LINK_SECRET.
//
// Rotating STATUS_LINK_SECRET invalidates every outstanding link at
// once — do so on suspected leak.

const SEP = ".";

function requireSecret(): string {
  const s = process.env.STATUS_LINK_SECRET;
  if (!s || s.length < 32) {
    // Fail closed. Also caught by /status/[token] page which shows
    // "Link unavailable" rather than 500ing.
    throw new Error("STATUS_LINK_SECRET must be set to a 32+ char value");
  }
  return s;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function unB64url(input: string): string {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(s, "base64").toString("utf8");
}

function sign(orderId: string, expiryMs: number): string {
  return createHmac("sha256", requireSecret())
    .update(`${orderId}:${expiryMs}`)
    .digest("hex");
}

/** Generate a status token that expires N days from now (default 30). */
export function makeStatusToken(orderId: string, daysValid = 30): string {
  const expiryMs = Date.now() + daysValid * 24 * 60 * 60 * 1000;
  const hmac = sign(orderId, expiryMs);
  return `${b64url(orderId)}${SEP}${b64url(String(expiryMs))}${SEP}${hmac}`;
}

export type StatusTokenPayload =
  | { ok: true; orderId: string; expiryMs: number }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" | "misconfigured" };

/** Parse + verify a status token in one call. Timing-safe. */
export function verifyStatusToken(token: string): StatusTokenPayload {
  let secretReady = false;
  try {
    requireSecret();
    secretReady = true;
  } catch {
    return { ok: false, reason: "misconfigured" };
  }
  if (!secretReady) return { ok: false, reason: "misconfigured" };

  const parts = token.split(SEP);
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  let orderId: string;
  let expiryMs: number;
  try {
    orderId = unB64url(parts[0]);
    expiryMs = Number(unB64url(parts[1]));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!orderId || !Number.isFinite(expiryMs)) {
    return { ok: false, reason: "malformed" };
  }

  const expected = sign(orderId, expiryMs);
  const providedBuf = Buffer.from(parts[2], "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, reason: "bad_signature" };
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: "bad_signature" };
  }

  if (Date.now() > expiryMs) return { ok: false, reason: "expired" };
  return { ok: true, orderId, expiryMs };
}

/**
 * Build the absolute URL for a status link. Uses NEXT_PUBLIC_APP_URL
 * so the link works when opened from a WhatsApp message on the
 * customer's phone — relative URLs don't survive that jump.
 */
export function statusLinkUrl(orderId: string, daysValid = 30): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/status/${makeStatusToken(orderId, daysValid)}`;
}
