"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  requestSignupCodeAction,
  verifySignupCodeAction,
} from "./actions";

// Two-step signup. Form fields survive across the email/code stages
// so a "resend code" or "back" keeps context. All server enforcement
// lives in actions.ts — this file is just UX.

type Stage =
  | { name: "form" }
  | { name: "code"; ownerName: string; companyName: string; email: string; phone: string };

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm() {
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [ownerName, setOwnerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = {
      ownerName: ownerName.trim(),
      companyName: companyName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.replace(/\D/g, "").slice(-10),
    };
    if (!clean.ownerName || !clean.companyName) {
      setError("Enter your name and company name.");
      return;
    }
    if (!EMAIL_RE.test(clean.email)) {
      setError("Enter a valid work email address.");
      return;
    }
    if (!PHONE_RE.test(clean.phone)) {
      setError("Enter a 10-digit Indian mobile number.");
      return;
    }
    startTransition(async () => {
      const res = await requestSignupCodeAction(clean);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setStage({ name: "code", ...clean });
    });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stage.name !== "code") return;
    startTransition(async () => {
      const res = await verifySignupCodeAction({ ...stage, token });
      if (res && "error" in res) setError(res.error);
    });
  }

  if (stage.name === "form") {
    return (
      <form onSubmit={submitForm} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Field label="Your name" value={ownerName} onChange={setOwnerName} autoComplete="name" />
        <Field label="Company name" value={companyName} onChange={setCompanyName} autoComplete="organization" />
        <Field label="Work email" value={email} onChange={setEmail} type="email" autoComplete="email" />
        <Field
          label="Mobile (10-digit)"
          value={phone}
          onChange={setPhone}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          prefix="+91"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          {pending ? "Sending…" : "Start free trial"}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          14-day trial. No credit card. Cancel any time.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="space-y-4" noValidate>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code we emailed to{" "}
        <strong className="text-foreground">{stage.email}</strong>.
      </p>
      <input
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={token}
        onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-widest"
        placeholder="123456"
      />
      <button
        type="submit"
        disabled={pending || token.length !== 6}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Verifying…" : "Verify & create company"}
      </button>
      <button
        type="button"
        onClick={() => setStage({ name: "form" })}
        className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Change details
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-stretch gap-0 rounded-md border border-input bg-background">
        {prefix && (
          <span className="flex items-center rounded-l-md border-r bg-muted px-3 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md bg-transparent px-3 py-2 text-sm outline-none"
          {...rest}
        />
      </div>
    </div>
  );
}
