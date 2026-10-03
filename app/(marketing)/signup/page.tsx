import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";
import { GoogleSignInButton } from "../login/google-button";
import {
  ONBOARDING_ONE_BY_ONE_MESSAGE,
  ONBOARDING_WHATSAPP_URL,
  isSignupEnabled,
} from "@/lib/signup-flag";

export const metadata: Metadata = {
  title: "Start free trial — Syncit",
  description:
    "Create your Syncit workspace in under 2 minutes. 14-day free trial, no credit card.",
};

// SY31 — gated by SIGNUP_ENABLED (default off). When off, no form and
// no Google button: companies are onboarded by the Syncit team.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  if (!isSignupEnabled()) return <SignupClosed />;
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

function SignupClosed() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-muted/30">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Get started with Syncit</h1>
          <p className="text-sm text-muted-foreground">{ONBOARDING_ONE_BY_ONE_MESSAGE}.</p>
          <a
            href={ONBOARDING_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Message us on WhatsApp
          </a>
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
