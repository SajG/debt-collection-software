"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { challengeAction } from "../actions";

export function ChallengeForm({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await challengeAction({
        code: code.trim(),
        next,
        useRecovery,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <label className="block text-sm font-medium">
        {useRecovery ? "Recovery code" : "6-digit code"}
      </label>
      <input
        autoFocus
        autoComplete="one-time-code"
        inputMode={useRecovery ? "text" : "numeric"}
        placeholder={useRecovery ? "e.g. ABCDE-FGHJK" : "123456"}
        value={code}
        onChange={(e) =>
          setCode(
            useRecovery
              ? e.target.value.toUpperCase()
              : e.target.value.replace(/\D/g, "").slice(0, 6),
          )
        }
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg tracking-widest text-center font-mono"
      />

      <button
        type="submit"
        disabled={pending || code.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : null}
        {pending ? "Verifying…" : "Verify"}
      </button>

      <button
        type="button"
        onClick={() => {
          setUseRecovery((v) => !v);
          setCode("");
          setError(null);
        }}
        className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {useRecovery
          ? "Use my authenticator app instead"
          : "I lost my authenticator — use a recovery code"}
      </button>
    </form>
  );
}
