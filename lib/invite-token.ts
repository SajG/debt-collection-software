import { createHash, randomBytes } from "node:crypto";

// SY42 — invitation tokens. 32 random bytes, base64url; only the SHA-256
// is stored, so a database read never yields a usable link.

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_RESEND_THROTTLE_MS = 5 * 60 * 1000;

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

export type InviteState = "pending" | "expired" | "accepted" | "revoked";

export function inviteState(
  inv: { status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED"; expiresAt: Date },
  now: Date = new Date(),
): InviteState {
  if (inv.status === "ACCEPTED") return "accepted";
  if (inv.status === "REVOKED") return "revoked";
  if (inv.status === "EXPIRED" || inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

export function looksLikeInviteToken(t: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(t);
}
