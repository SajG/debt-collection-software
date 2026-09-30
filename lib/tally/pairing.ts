import { createHash, randomBytes } from "node:crypto";

// SY27 — Tally pairing primitives.
//
// * Pairing code: 8 characters, [A-Z2-9] (no O/0/I/1 confusable set),
//   trivial to read from an admin's phone to their Windows PC.
// * Long-lived token: 32 bytes base64url, prefixed `syt_` so it's
//   distinguishable from any other secret in a leaked log.
//
// Only SHA-256 hashes are stored — the plaintext never lives at rest.

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePairingCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += ALPHA[b % ALPHA.length];
  return out;
}

export function generateConnectorToken(): string {
  // 32 bytes = 256 bits. Prefix keeps it grep-friendly.
  const raw = randomBytes(32).toString("base64url");
  return `syt_${raw}`;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Case-normalise a user-typed pairing code — we render uppercase in
 *  the UI, but admins re-typing on Windows sometimes stray. */
export function normalizePairingCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
}
