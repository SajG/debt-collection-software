import { makeStatusToken, verifyStatusToken } from "@/lib/status-link";

// Signed 7-day link to one customer's statement of account.
//
// Reuses the order-status signing (lib/status-link.ts: HMAC-SHA256 with
// STATUS_LINK_SECRET, expiry inside the signed payload, timing-safe
// verify, fails closed without a secret) without changing it. The
// signed subject is "stmt:<partyId>" instead of an order id, so the two
// kinds of link can never stand in for each other:
//   * a statement token opened at /status/… looks up an order whose id
//     starts with "stmt:" — none exists;
//   * an order token opened at /statement/… has no "stmt:" prefix and
//     is refused here.
//
// The link shows one customer's ledger and nothing else. Anyone holding
// it can read it until it expires; rotate STATUS_LINK_SECRET to revoke
// every outstanding link.

const PREFIX = "stmt:";
export const STATEMENT_LINK_DAYS = 7;

export function makeStatementToken(partyId: string): string {
  return makeStatusToken(`${PREFIX}${partyId}`, STATEMENT_LINK_DAYS);
}

export type StatementTokenPayload =
  | { ok: true; partyId: string; expiryMs: number }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" | "misconfigured" };

export function verifyStatementToken(token: string): StatementTokenPayload {
  const v = verifyStatusToken(token);
  if (!v.ok) return v;
  if (!v.orderId.startsWith(PREFIX) || v.orderId.length === PREFIX.length) {
    // A validly signed ORDER token. Same answer as a forged one.
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, partyId: v.orderId.slice(PREFIX.length), expiryMs: v.expiryMs };
}

/** Absolute URL — it is opened from WhatsApp on the customer's phone. */
export function statementLinkUrl(partyId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/statement/${makeStatementToken(partyId)}`;
}
