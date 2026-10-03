/**
 * SY31 — open-redirect guard. callbackUrl / next must never send a
 * signed-in user to another origin.
 */

import { describe, expect, it } from "vitest";
import { safePath } from "../safe-redirect";

describe("safePath", () => {
  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["https://x"],
    ["javascript:alert(1)"],
    ["evil.com"],
    ["/dash\\board"],
    ["/%0d%0a\n//evil.com"],
    [""],
  ])("rejects %j", (input) => {
    expect(safePath(input, "/fallback")).toBe("/fallback");
  });

  it.each([["/dashboard"], ["/"], ["/parties?x=1#a"], ["/settings/security?first=1"]])(
    "accepts %j",
    (input) => {
      expect(safePath(input, "/fallback")).toBe(input);
    },
  );

  it("falls back for null / undefined", () => {
    expect(safePath(null, "/dashboard")).toBe("/dashboard");
    expect(safePath(undefined, "/dashboard")).toBe("/dashboard");
  });
});
