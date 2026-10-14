import { describe, expect, it } from "vitest";
import { isValidGstin, normalizeGstin } from "../validation/gstin";
import {
  attributionFromRequest,
  parseAttribution,
  serializeAttribution,
} from "../attribution";

describe("gstin", () => {
  it("accepts a well-formed GSTIN with a correct checksum", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin(" 27aapfu0939f1zv ")).toBe(true);
  });
  it("rejects a wrong checksum, shape or state code", () => {
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1AV")).toBe(false);
    expect(isValidGstin("00AAPFU0939F1ZV")).toBe(false);
    expect(isValidGstin("")).toBe(false);
  });
  it("normalizes whitespace and case", () => {
    expect(normalizeGstin(" 27aa pfu0939f1zv")).toBe("27AAPFU0939F1ZV");
  });
});

describe("attribution", () => {
  const url = new URL("https://getsyncit.app/pricing?utm_source=google&utm_campaign=tally&gclid=abc");
  it("captures utm + external referrer", () => {
    const a = attributionFromRequest({
      url,
      referer: "https://www.google.com/search?q=x",
      now: new Date("2026-10-14T00:00:00Z"),
    });
    expect(a).toMatchObject({
      utmSource: "google",
      utmCampaign: "tally",
      gclid: "abc",
      referrer: "www.google.com/search",
      landingPath: "/pricing",
    });
  });
  it("ignores internal navigation with no params", () => {
    const a = attributionFromRequest({
      url: new URL("https://getsyncit.app/features"),
      referer: "https://getsyncit.app/",
    });
    expect(a).toBeNull();
  });
  it("records referral code from /r/<code>", () => {
    const a = attributionFromRequest({ url: new URL("https://getsyncit.app/r/AB12"), referer: null });
    expect(a?.referralCode).toBe("AB12");
  });
  it("round-trips and survives garbage", () => {
    const a = { utmSource: "x", landingPath: "/" };
    expect(parseAttribution(serializeAttribution(a))).toEqual(a);
    expect(parseAttribution("%%%")).toEqual({});
    expect(parseAttribution(undefined)).toEqual({});
  });
});

import { safePath } from "../safe-redirect";
describe("safePath for invite and signup landings", () => {
  it("keeps /join/<token> and /signup/complete, rejects off-site", () => {
    expect(safePath("/join/abcDEF_-123", "/dashboard")).toBe("/join/abcDEF_-123");
    expect(safePath("/signup/complete", "/dashboard")).toBe("/signup/complete");
    expect(safePath("//evil.com", "/dashboard")).toBe("/dashboard");
  });
});
