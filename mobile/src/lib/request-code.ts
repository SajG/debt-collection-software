// Thin wrapper around POST /api/auth/request-code (audit item 9).
// Mobile no longer calls supabase.auth.signInWithOtp directly — the
// Next route runs the same per-email rate limit + Sentry logging the
// web sign-in path uses. Response is uniform {ok:true} so callers
// always advance to the code screen.

const BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export type RequestCodeResult =
  | { ok: true }
  | { rateLimited: true; message: string }
  | { networkError: true; message: string };

/**
 * Fire the server-side request-code endpoint. Never throws. All
 * failure modes are folded into the union so the caller can decide
 * whether to advance the UI or show a message.
 */
export async function requestEmailCode(
  email: string,
): Promise<RequestCodeResult> {
  if (!BASE) {
    // No configured app URL — fall back to a network error rather
    // than silently succeed. Adds a fast local signal in dev.
    return {
      networkError: true,
      message: "EXPO_PUBLIC_APP_URL is not set.",
    };
  }
  try {
    const res = await fetch(`${BASE}/api/auth/request-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        rateLimited: true,
        message: body.error ?? "Too many code requests. Try again later.",
      };
    }
    if (!res.ok) {
      return {
        networkError: true,
        message: `Request failed (${res.status}).`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      networkError: true,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
