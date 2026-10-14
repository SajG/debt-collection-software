"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { joinAsSignedInUserAction, joinWithNewAccountAction } from "../actions";

const btn =
  "flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function JoinSignedIn({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <ErrorBox message={error} />
      <button
        className={btn}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await joinAsSignedInUserAction({ token });
            if (res && "error" in res) setError(res.error);
          })
        }
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        Accept invitation
      </button>
    </div>
  );
}

export function JoinNewAccount({
  token,
  email,
  defaultName,
  defaultPhone,
}: {
  token: string;
  email: string;
  defaultName: string;
  defaultPhone: string;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await joinWithNewAccountAction({
            token,
            ownerName: name,
            phone: phone.replace(/\D/g, "").slice(-10),
            password,
          });
          if (res && "error" in res) setError(res.error);
        });
      }}
    >
      <ErrorBox message={error} />
      <div className="space-y-1.5">
        <label className="block text-sm font-medium" htmlFor="join-email">Email</label>
        <input id="join-email" className={input} value={email} disabled readOnly />
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium" htmlFor="join-name">Your name</label>
        <input id="join-name" className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium" htmlFor="join-phone">Mobile (10-digit)</label>
        <input
          id="join-phone"
          className={input}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="numeric"
          autoComplete="tel"
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium" htmlFor="join-password">Choose a password</label>
        <input
          id="join-password"
          className={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 10 characters"
        />
      </div>
      <button className={btn} disabled={pending || !name || !password}>
        {pending && <Loader2 size={16} className="animate-spin" />}
        Join team
      </button>
    </form>
  );
}
