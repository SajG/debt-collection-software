"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { passwordLoginAction } from "./actions";
import { EmailCodeForm } from "./email-code/email-code-form";

// SY42 — email + password sign-in, with the emailed 6-digit code kept
// as a secondary path (invited staff who haven't set a password yet).

export function PasswordForm({
  callbackUrl,
  defaultEmail,
  startWithCode,
}: {
  callbackUrl?: string;
  defaultEmail?: string;
  startWithCode?: boolean;
}) {
  const [useCode, setUseCode] = useState(!!startWithCode);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (useCode) {
    return (
      <div className="space-y-4">
        <EmailCodeForm callbackUrl={callbackUrl} defaultEmail={defaultEmail} />
        <button
          type="button"
          onClick={() => setUseCode(false)}
          className="w-full text-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Use password instead
        </button>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await passwordLoginAction({ email, password, callbackUrl });
      if (res && "error" in res) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="login-email" className="block text-sm font-medium">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="login-password" className="block text-sm font-medium">Password</label>
          <Link href="/login/forgot" className="text-xs text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending || !email || !password}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <button
        type="button"
        onClick={() => setUseCode(true)}
        className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Email me a code instead
      </button>
    </form>
  );
}
