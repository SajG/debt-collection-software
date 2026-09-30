import { hashSecret } from "./pairing";
import { normalizePairingCode } from "./pairing";

// SY27 — Tally helpers that need to be importable from server
// components. Kept OUT of settings/tally/actions.ts because that
// file uses "use server", which only allows async exports.

/** True when a connector hasn't checked in for 24h+ on a weekday. */
export function isStale(lastSeenAt: Date | null, now = new Date()): boolean {
  if (!lastSeenAt) return false;
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false; // Sat/Sun
  return now.getTime() - lastSeenAt.getTime() > 24 * 60 * 60 * 1000;
}

/** Raw connector error → plain English for the admin. */
export function friendlyTallyError(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("econnrefused") || lower.includes("connection refused")) {
    return "Tally is not running. Open Tally on this PC and load the company.";
  }
  if (
    lower.includes("port 9000") ||
    lower.includes("port not enabled") ||
    lower.includes("odbc")
  ) {
    return "Port 9000 is not enabled — in Tally, F12 → Advanced → Allow ODBC/HTTP.";
  }
  if (lower.includes("no company") || lower.includes("company not loaded")) {
    return "No company is loaded in Tally. Select the company you want to sync.";
  }
  if (lower.includes("timeout")) {
    return "Tally didn't respond in time. Try again in a minute.";
  }
  return raw.slice(0, 240);
}

/** Normalise + hash a user-typed pairing code. */
export function normalizeAndHash(input: string): string {
  return hashSecret(normalizePairingCode(input));
}
