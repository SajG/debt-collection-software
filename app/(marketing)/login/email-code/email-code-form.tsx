"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  requestEmailCodeAction,
  verifyEmailCodeAction,
} from "../actions";

// Two-step email-code UI. Same shape as the mobile flow so users
// switching between surfaces see one consistent pattern:
//
//   1. Enter email → "Send code"
//   2. Enter 6-digit code → "Verify"
//
// Resend has a 30-second cooldown; failures use the same generic
// error message for unknown-email / wrong-code / expired / rate-
// limited (see server-side rules in actions.ts).

const RESEND_COOLDOWN_S = 30;

type Stage =
  | { name: "email" }
  | { name: "code"; email: string; sentAt: number };

export function EmailCodeForm({ callbackUrl }: { callbackUrl?: string }) {
  const [stage, setStage] = useState<Stage>({ name: "email" });
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (stage.name !== "code") return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);

  const cooldownLeft =
    stage.name === "code"
      ? Math.max(
          0,
          RESEND_COOLDOWN_S - Math.floor((nowTick - stage.sentAt) / 1000),
        )
      : 0;

  function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();
    startTransition(async () => {
      const res = await requestEmailCodeAction({
        email: clean,
        callbackUrl,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setStage({ name: "code", email: clean, sentAt: Date.now() });
    });
  }

  function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (stage.name !== "code") return;
    startTransition(async () => {
      const res = await verifyEmailCodeAction({
        email: stage.email,
        token: token.trim(),
        callbackUrl,
      });
      if (res && "error" in res) setError(res.error);
    });
  }

  function resend() {
    if (stage.name !== "code" || cooldownLeft > 0) return;
    setError(null);
    startTransition(async () => {
      const res = await requestEmailCodeAction({
        email: stage.email,
        callbackUrl,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setStage({ name: "code", email: stage.email, sentAt: Date.now() });
    });
  }

  if (stage.name === "email") {
    return (
      <form onSubmit={sendCode} className="space-y-4" noValidate>
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="you@company.com"
          required
        />
        <button
          type="submit"
          disabled={pending || email.trim().length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : null}
          {pending ? "Sending…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code sent to{" "}
        <strong className="text-foreground">{stage.email}</strong>.
      </p>
      <input
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={token}
        onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg tracking-widest text-center font-mono"
        placeholder="123456"
      />
      <button
        type="submit"
        disabled={pending || token.length !== 6}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : null}
        {pending ? "Verifying…" : "Verify"}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={resend}
          disabled={cooldownLeft > 0 || pending}
          className="text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldownLeft > 0 ? `Resend in ${cooldownLeft}s` : "Resend code"}
        </button>
        <button
          type="button"
          onClick={() => setStage({ name: "email" })}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Change email
        </button>
      </div>
    </form>
  );
}
