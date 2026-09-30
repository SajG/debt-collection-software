import type { Metadata } from "next";
import Link from "next/link";
import { EmailCodeForm } from "./email-code/email-code-form";
import { GoogleSignInButton } from "./google-button";

export const metadata: Metadata = {
  title: "Sign in — Syncit",
};

// SY23 — web sign-in options: Google OAuth OR emailed 6-digit code.
// Password auth is fully removed; the Supabase project should have
// email+password disabled (docs/LOGIN-RUNBOOK.md).

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string; recovered?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Syncit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email — we&apos;ll send you a 6-digit code.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm space-y-4">
          {searchParams.error === "invalid_link" && (
            <div
              role="alert"
              className="mb-1 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              That link has expired or is no longer valid. Please sign in
              again.
            </div>
          )}
          {searchParams.error === "oauth_failed" && (
            <div
              role="alert"
              className="mb-1 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              Google sign-in didn&apos;t complete. Try again or use email code.
            </div>
          )}
          {searchParams.recovered === "1" && (
            <div
              role="alert"
              className="mb-1 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
            >
              Recovery code accepted. Sign in again and re-enrol your
              authenticator from Settings → Security.
            </div>
          )}

          <GoogleSignInButton
            label="Continue with Google"
            next={searchParams.callbackUrl ?? "/dashboard"}
          />
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-border" />
            <span className="mx-3 text-xs uppercase tracking-wide text-muted-foreground">
              or with email
            </span>
            <div className="flex-grow border-t border-border" />
          </div>
          <EmailCodeForm callbackUrl={searchParams.callbackUrl} />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Syncit?{" "}
          <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
            Start free trial →
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Also on iOS &amp; Android — same account, same data.
        </p>
      </div>
    </main>
  );
}
