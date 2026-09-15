"use client";

import { useState, useTransition } from "react";
import { finishEnrolAction, startEnrolAction } from "./actions";

type Stage =
  | { name: "idle" }
  | {
      name: "showing";
      factorId: string;
      qrCodeSvg: string;
      secret: string;
    }
  | { name: "codes"; codes: string[] };

export function EnrollTotpPanel() {
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function begin() {
    setError(null);
    startTransition(async () => {
      const res = await startEnrolAction();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setStage({
        name: "showing",
        factorId: res.factorId,
        qrCodeSvg: res.qrCodeSvg,
        secret: res.secret,
      });
    });
  }

  function confirm() {
    if (stage.name !== "showing") return;
    setError(null);
    startTransition(async () => {
      const res = await finishEnrolAction({ factorId: stage.factorId, code });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setStage({ name: "codes", codes: res.recoveryCodes });
      setCode("");
    });
  }

  if (stage.name === "idle") {
    return (
      <div className="flex flex-col items-start gap-2">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={begin}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Preparing…" : "Enable TOTP"}
        </button>
      </div>
    );
  }

  if (stage.name === "showing") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded border border-border bg-white p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Scan this QR with your authenticator app, or enter the
            secret manually.
          </p>
          <div
            className="mx-auto w-56"
            dangerouslySetInnerHTML={{ __html: stage.qrCodeSvg }}
          />
          <p className="mt-3 break-all rounded bg-muted p-2 text-center font-mono text-xs">
            {stage.secret}
          </p>
        </div>
        <label className="text-sm font-medium">
          Enter the current 6-digit code
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="w-full rounded border border-input bg-background px-3 py-2 text-lg tracking-widest text-center font-mono"
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={pending || code.length !== 6}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Verifying…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setStage({ name: "idle" })}
            disabled={pending}
            className="rounded-md border border-border bg-white px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Recovery-codes reveal — shown exactly once.
  return (
    <div className="rounded border border-emerald-400 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">
        TOTP is enabled. Save these recovery codes now — they will not be
        shown again.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
        {stage.codes.map((c) => (
          <li
            key={c}
            className="rounded bg-white px-2 py-1 text-center tracking-widest text-emerald-900"
          >
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(stage.codes.join("\n"));
          }}
          className="rounded-md border border-emerald-500 bg-white px-3 py-1 text-xs font-semibold text-emerald-900"
        >
          Copy all
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-emerald-500 bg-white px-3 py-1 text-xs font-semibold text-emerald-900"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => setStage({ name: "idle" })}
          className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white"
        >
          I&apos;ve saved them
        </button>
      </div>
    </div>
  );
}
