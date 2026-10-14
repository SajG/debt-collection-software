// Store-review sign-in (see lib/platform/review-login.ts on the server).
// Called only after the normal emailed code was rejected. Returns the
// session tokens for a review account, or null for everyone else —
// including when there is no network. Never throws.

const BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export async function tryReviewLogin(
  email: string,
  code: string,
): Promise<{ access_token: string; refresh_token: string } | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/api/auth/review-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!body.access_token || !body.refresh_token) return null;
    return { access_token: body.access_token, refresh_token: body.refresh_token };
  } catch {
    return null;
  }
}
