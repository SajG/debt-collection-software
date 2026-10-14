"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setPasswordAction } from "../login/actions";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (password !== confirm) return setError("The two passwords don't match.");
        startTransition(async () => {
          const res = await setPasswordAction({ password });
          if ("error" in res) return setError(res.error);
          router.replace("/dashboard");
        });
      }}
    >
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <input
        type="password"
        autoComplete="new-password"
        placeholder="New password (10+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Repeat new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending || !password}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        Save password
      </button>
    </form>
  );
}
