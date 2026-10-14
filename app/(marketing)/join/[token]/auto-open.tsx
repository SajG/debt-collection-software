"use client";

import { useEffect } from "react";

// SY42 — Android: hand the invite straight to the app. An intent:// URL
// opens the app when installed and otherwise lands back on this page
// with ?web=1 (so it cannot loop). iOS has no equivalent that fails
// quietly — an unhandled custom scheme shows an error sheet — so iPhone
// users get the explicit "Open the Syncit app" button instead.
export function AutoOpenInApp({ token, packageName }: { token: string; packageName: string }) {
  useEffect(() => {
    if (!/Android/i.test(navigator.userAgent)) return;
    const fallback = `${window.location.origin}/join/${token}?web=1`;
    const intent =
      `intent://join?token=${encodeURIComponent(token)}` +
      `#Intent;scheme=syncit;package=${packageName};` +
      `S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
    window.location.replace(intent);
  }, [token, packageName]);
  return null;
}
