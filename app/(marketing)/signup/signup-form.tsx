"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { signUpWithPasswordAction } from "./actions";
import {
  CompanyFields,
  Field,
  emptyCompanyForm,
  firstFormError,
  normalizeForm,
  type CompanyForm,
} from "./company-fields";

// SY42 — one-page sign-up: owner + company details + password. The
// emailed confirmation link creates the company (see /auth/callback).
// All server enforcement lives in actions.ts.

export function SignupForm({ referralCode }: { referralCode?: string }) {
  const [form, setForm] = useState<CompanyForm>(emptyCompanyForm);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = firstFormError(form);
    if (problem) return setError(problem);
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    const details = normalizeForm(form);
    startTransition(async () => {
      const res = await signUpWithPasswordAction({ details, password, ref: referralCode });
      if ("error" in res) return setError(res.error);
      setSentTo(details.email);
    });
  }

  if (sentTo) {
    return (
      <div className="space-y-3 text-center">
        <MailCheck className="mx-auto text-primary" size={32} />
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{sentTo}</strong>.
          Click it to create your company and sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <CompanyFields value={form} onChange={setForm} />
      <hr className="border-border" />
      <Field
        label="Password"
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="new-password"
        placeholder="At least 10 characters"
      />
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Creating…" : "Start free trial"}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        14-day trial. No credit card. Cancel any time.
      </p>
    </form>
  );
}
