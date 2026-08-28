/**
 * SY-email regression guard: checkEmailOtpSendLimit trips on the
 * 4th send in a 15-minute window for the same email. Also confirms
 * the fixture-count boundary — a 3rd send is not limited.
 *
 * The behaviour under test is the WHOLE reason we split EMAIL_OTP
 * out from PASSWORD in the LoginAttempt.factor enum: a stampede on
 * one factor can no longer burn the other's budget. If someone
 * later "cleans up" checkEmailOtpSendLimit into checkLoginRateLimit
 * with a different threshold, this test flags it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @/lib/db before importing the module under test so the count
// call resolves to whatever the test wants.
const countMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    loginAttempt: {
      count: (args: unknown) => countMock(args),
    },
  },
}));

let checkEmailOtpSendLimit: (
  email: string,
) => Promise<{ limited: boolean; retryAfterMinutes: number }>;

beforeEach(async () => {
  countMock.mockReset();
  vi.resetModules();
  ({ checkEmailOtpSendLimit } = await import("../rate-limit"));
});
afterEach(() => vi.clearAllMocks());

describe("checkEmailOtpSendLimit — SY-email cap", () => {
  it("allows the 1st send", async () => {
    countMock.mockResolvedValueOnce(0);
    const r = await checkEmailOtpSendLimit("alice@example.com");
    expect(r.limited).toBe(false);
  });

  it("allows the 3rd send but not the 4th", async () => {
    countMock.mockResolvedValueOnce(2);
    expect((await checkEmailOtpSendLimit("bob@example.com")).limited).toBe(
      false,
    );
    countMock.mockResolvedValueOnce(3);
    expect((await checkEmailOtpSendLimit("bob@example.com")).limited).toBe(
      true,
    );
  });

  it("returns the 15-minute retry window", async () => {
    countMock.mockResolvedValueOnce(10);
    const r = await checkEmailOtpSendLimit("carol@example.com");
    expect(r.limited).toBe(true);
    expect(r.retryAfterMinutes).toBe(15);
  });

  it("counts by (email, factor='EMAIL_OTP') — not by every attempt", async () => {
    countMock.mockResolvedValueOnce(0);
    await checkEmailOtpSendLimit("dave@example.com");
    const callArgs = countMock.mock.calls[0]?.[0] as {
      where?: { factor?: string; email?: string; successful?: boolean };
    };
    expect(callArgs?.where?.factor).toBe("EMAIL_OTP");
    expect(callArgs?.where?.email).toBe("dave@example.com");
    // Critical: no `successful: false` filter — SY-email counts
    // successful sends too. A bad guess doesn't need to happen for
    // a spammer to hit the cap.
    expect(callArgs?.where?.successful).toBeUndefined();
  });
});
