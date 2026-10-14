"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { forgotPasswordAction } from "../actions";

export function ForgotForm({ defaultEmail }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        If <strong className="text-foreground">{email}</strong> is registered, a reset link is on
        its way. It expires in an hour.
      </p>
    );
  }
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await forgotPasswordAction({ email });
          if ("error" in res) setError(res.error);
          else setSent(true);
        });
      }}
    >
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <input
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending || !email}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        Send reset link
      </button>
    </form>
  );
}
