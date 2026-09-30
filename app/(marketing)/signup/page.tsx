import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";
import { GoogleSignInButton } from "../login/google-button";

export const metadata: Metadata = {
  title: "Start free trial — Syncit",
  description:
    "Create your Syncit workspace in under 2 minutes. 14-day free trial, no credit card.",
};

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-muted/30">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Start your Syncit trial</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            No credit card. 14 days. Your team can start using it today.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm space-y-4">
          <GoogleSignInButton label="Continue with Google" next="/onboarding" />
          <Divider />
          <SignupForm />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in →
          </Link>
        </p>
      </div>
    </main>
  );
}

function Divider() {
  return (
    <div className="relative flex items-center py-1">
      <div className="flex-grow border-t border-border" />
      <span className="mx-3 text-xs uppercase tracking-wide text-muted-foreground">
        or with email
      </span>
      <div className="flex-grow border-t border-border" />
    </div>
  );
}
