// SY37 — store buttons appear only once the listing is public.
//
//   ANDROID_LIVE="true"            Google Play listing is public
//   IOS_LIVE="true"                App Store listing is public
//   IOS_APP_STORE_URL="https://apps.apple.com/app/id…"   set with IOS_LIVE
//
// Anything other than the exact string "true" means "not yet", so a
// missing or mistyped variable never shows a button that leads to a
// "not found" store page. The Android URL is fixed by the package id;
// the iOS URL only exists after App Store Connect assigns an id, so
// iOS is live only when both the flag and the URL are set.

export const ANDROID_PACKAGE = "app.getsyncit";
export const ANDROID_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export type StoreLinks = {
  android: { live: boolean; url: string };
  ios: { live: boolean; url: string };
};

export function storeLinks(env: NodeJS.ProcessEnv = process.env): StoreLinks {
  const iosUrl = (env.IOS_APP_STORE_URL ?? "").trim();
  const iosUrlOk = /^https:\/\/apps\.apple\.com\//.test(iosUrl);
  return {
    android: { live: env.ANDROID_LIVE === "true", url: ANDROID_STORE_URL },
    ios: { live: env.IOS_LIVE === "true" && iosUrlOk, url: iosUrlOk ? iosUrl : "" },
  };
}
