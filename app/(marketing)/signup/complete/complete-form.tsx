"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { completeGoogleSignupAction } from "../actions";
import {
  CompanyFields,
  emptyCompanyForm,
  firstFormError,
  normalizeForm,
  type CompanyForm,
} from "../company-fields";

export function CompleteForm({
  email,
  ownerName,
  referralCode,
}: {
  email: string;
  ownerName: string;
  referralCode?: string;
}) {
  const [form, setForm] = useState<CompanyForm>({ ...emptyCompanyForm, email, ownerName });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = firstFormError(form);
    if (problem) return setError(problem);
    startTransition(async () => {
      const res = await completeGoogleSignupAction({
        details: normalizeForm(form),
        ref: referralCode,
      });
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
      <CompanyFields value={form} onChange={setForm} lockEmail />
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Creating…" : "Create company"}
      </button>
    </form>
  );
}
