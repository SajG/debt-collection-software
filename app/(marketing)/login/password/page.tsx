import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "../login-form";

export const metadata: Metadata = {
  title: "Sign in with password — Syncit",
};

export default function LoginPasswordPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Syncit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your email and password.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          {searchParams.error === "invalid_link" && (
            <div
              role="alert"
              className="mb-5 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              That link has expired or is no longer valid. Please sign in
              again.
            </div>
          )}
          <LoginForm callbackUrl={searchParams.callbackUrl} />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Syncit?{" "}
          <Link
            href="/signup"
            className="text-primary underline-offset-4 hover:underline"
          >
            Start free trial →
          </Link>
        </p>
      </div>
    </main>
  );
}
