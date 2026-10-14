import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeStatusToken, verifyStatusToken } from "../status-link";
import { makeStatementToken, statementLinkUrl, verifyStatementToken } from "../statement-link";

beforeAll(() => {
  process.env.STATUS_LINK_SECRET = "x".repeat(40);
  process.env.NEXT_PUBLIC_APP_URL = "https://getsyncit.app/";
});

describe("statement link", () => {
  it("round-trips the customer id and expires in 7 days", () => {
    const v = verifyStatementToken(makeStatementToken("party_123"));
    expect(v.ok && v.partyId).toBe("party_123");
    if (v.ok) {
      const days = (v.expiryMs - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThanOrEqual(7);
    }
  });

  it("refuses an order-status token, even though it is validly signed", () => {
    const orderToken = makeStatusToken("party_123", 30);
    expect(verifyStatusToken(orderToken).ok).toBe(true);
    expect(verifyStatementToken(orderToken)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("a statement token is useless as an order token for that id", () => {
    const v = verifyStatusToken(makeStatementToken("party_123"));
    expect(v.ok && v.orderId).toBe("stmt:party_123"); // not an id any order can have
  });

  it("refuses a tampered customer id, an empty id and garbage", () => {
    const [, exp, sig] = makeStatementToken("party_123").split(".");
    const other = Buffer.from("stmt:party_999").toString("base64url");
    expect(verifyStatementToken(`${other}.${exp}.${sig}`).ok).toBe(false);
    expect(verifyStatementToken(makeStatusToken("stmt:", 7)).ok).toBe(false);
    expect(verifyStatementToken("nope").ok).toBe(false);
  });

  it("expires", () => {
    const token = makeStatementToken("party_123");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(verifyStatementToken(token)).toEqual({ ok: false, reason: "expired" });
    vi.useRealTimers();
  });

  it("fails closed without a secret", () => {
    const token = makeStatementToken("party_123");
    const saved = process.env.STATUS_LINK_SECRET;
    process.env.STATUS_LINK_SECRET = "short";
    expect(verifyStatementToken(token)).toEqual({ ok: false, reason: "misconfigured" });
    process.env.STATUS_LINK_SECRET = saved;
  });

  it("builds an absolute URL without a double slash", () => {
    expect(statementLinkUrl("p1")).toMatch(/^https:\/\/getsyncit\.app\/statement\/[\w-]+\.[\w-]+\.[0-9a-f]{64}$/);
  });
});
