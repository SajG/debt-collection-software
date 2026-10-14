import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password — Syncit" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll email you a link to choose a new one.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <ForgotForm defaultEmail={searchParams.email} />
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
