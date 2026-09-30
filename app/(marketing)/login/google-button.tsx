"use client";

import { useState } from "react";
import { createClient as supabaseBrowser } from "@/lib/supabase/client";

// SY23 — "Continue with Google" (web only). Uses Supabase's built-in
// Google OAuth provider; the /auth/callback route resolves the
// session and either routes existing members to /dashboard or new
// users to /onboarding (see app/auth/callback/route.ts).

export function GoogleSignInButton({
  label,
  next = "/dashboard",
}: {
  label: string;
  next?: string;
}) {
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    const supabase = supabaseBrowser();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setPending(false);
      window.alert(`Google sign-in failed: ${error.message}`);
    }
    // On success the browser navigates to Google, then to /auth/callback.
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted/50 disabled:opacity-60"
    >
      <GoogleGlyph />
      {pending ? "Redirecting…" : label}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.7 30.4.5 24 .5 14.6.5 6.6 6 2.8 14.1l7.9 6.1C12.5 14 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.6 24.6c0-1.5-.1-3-.4-4.4H24v8.4h12.7c-.6 3-2.3 5.5-4.9 7.2l7.7 6c4.5-4.2 7.1-10.4 7.1-17.2z"
      />
      <path
        fill="#FBBC05"
        d="M10.7 28.7c-.6-1.7-.9-3.4-.9-5.2s.3-3.5.9-5.2l-7.9-6.1C1.1 16.1 0 20 0 24s1.1 7.9 2.8 11.7l7.9-7z"
      />
      <path
        fill="#34A853"
        d="M24 47.5c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.5-13.5-10.5l-7.9 6.1C6.6 42 14.6 47.5 24 47.5z"
      />
    </svg>
  );
}
