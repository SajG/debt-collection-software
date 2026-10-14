import { describe, expect, it } from "vitest";
import { storeLinks } from "../store-links";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("store links", () => {
  it("shows nothing until the flags say so", () => {
    const s = storeLinks(env({}));
    expect(s.android.live).toBe(false);
    expect(s.ios.live).toBe(false);
  });

  it("only the exact string \"true\" turns a store on", () => {
    for (const v of ["1", "TRUE", "yes", " true", ""]) {
      expect(storeLinks(env({ ANDROID_LIVE: v })).android.live).toBe(false);
    }
    expect(storeLinks(env({ ANDROID_LIVE: "true" })).android).toEqual({
      live: true,
      url: "https://play.google.com/store/apps/details?id=app.getsyncit",
    });
  });

  it("iOS needs both the flag and a real App Store URL", () => {
    expect(storeLinks(env({ IOS_LIVE: "true" })).ios.live).toBe(false);
    expect(storeLinks(env({ IOS_LIVE: "true", IOS_APP_STORE_URL: "https://example.com/x" })).ios.live).toBe(false);
    expect(
      storeLinks(env({ IOS_LIVE: "true", IOS_APP_STORE_URL: "https://apps.apple.com/app/id6700000000" })).ios,
    ).toEqual({ live: true, url: "https://apps.apple.com/app/id6700000000" });
    expect(storeLinks(env({ IOS_APP_STORE_URL: "https://apps.apple.com/app/id6700000000" })).ios.live).toBe(false);
  });
});
