import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_MS,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  looksLikeInviteToken,
  newInviteToken,
} from "../invite-token";

describe("invite token", () => {
  it("generates unique url-safe tokens that pass the shape check", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).not.toBe(b);
    expect(looksLikeInviteToken(a)).toBe(true);
    expect(looksLikeInviteToken("short")).toBe(false);
    expect(looksLikeInviteToken(a + "!")).toBe(false);
  });
  it("hashes deterministically and never equals the token", () => {
    const t = newInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toBe(t);
    expect(hashInviteToken(t)).toHaveLength(64);
  });
  it("expires after 7 days", () => {
    const now = new Date("2026-10-14T00:00:00Z");
    expect(inviteExpiry(now).getTime() - now.getTime()).toBe(INVITE_TTL_MS);
  });
  it("derives state from status + expiry", () => {
    const now = new Date("2026-10-14T00:00:00Z");
    const future = new Date("2026-10-20T00:00:00Z");
    const past = new Date("2026-10-01T00:00:00Z");
    expect(inviteState({ status: "PENDING", expiresAt: future }, now)).toBe("pending");
    expect(inviteState({ status: "PENDING", expiresAt: past }, now)).toBe("expired");
    expect(inviteState({ status: "ACCEPTED", expiresAt: past }, now)).toBe("accepted");
    expect(inviteState({ status: "REVOKED", expiresAt: future }, now)).toBe("revoked");
  });
});
