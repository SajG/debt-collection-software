import type { Metadata } from "next";
import { EmailCodeForm } from "./email-code-form";

// Alternative sign-in path — email + 6-digit code, no password.
// Same allowlist and rate limits as the mobile flow; ADMIN accounts
// still get bounced to /login/challenge for TOTP after landing here.

export const metadata: Metadata = {
  title: "Sign in with email code — Syncit",
};

export default function EmailCodePage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Syncit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with a code we&apos;ll email to you.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <EmailCodeForm callbackUrl={searchParams.callbackUrl} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Also on iOS &amp; Android — same account, same data.
        </p>
      </div>
    </main>
  );
}
