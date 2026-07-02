"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { signupAction } from "./actions";

const schema = z
  .object({
    businessName: z
      .string()
      .min(2, "Enter your business name")
      .max(100)
      .trim(),
    ownerName: z
      .string()
      .min(2, "Enter your name")
      .max(100)
      .trim(),
    email: z
      .string()
      .email("Enter a valid email address"),
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "One uppercase letter")
      .regex(/[0-9]/, "One number")
      .regex(/[^A-Za-z0-9]/, "One special character"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

const passwordRules = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function SignupForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [passwordValue, setPasswordValue] = useState("");

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await signupAction(data);
      if (result?.error) {
        if (result.field) {
          setError(result.field, { message: result.error });
        } else {
          setError("root", { message: result.error });
        }
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {errors.root && (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {errors.root.message}
        </div>
      )}

      {/* Business name */}
      <Field label="Business name" error={errors.businessName?.message}>
        <input
          type="text"
          autoComplete="organization"
          placeholder="e.g. Sharma Traders"
          className={fieldClass(!!errors.businessName)}
          {...register("businessName")}
        />
      </Field>

      {/* Owner name */}
      <Field label="Your name" error={errors.ownerName?.message}>
        <input
          type="text"
          autoComplete="name"
          placeholder="e.g. Rahul Sharma"
          className={fieldClass(!!errors.ownerName)}
          {...register("ownerName")}
        />
      </Field>

      {/* Email */}
      <Field label="Email address" error={errors.email?.message}>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className={fieldClass(!!errors.email)}
          {...register("email")}
        />
      </Field>

      {/* Phone */}
      <Field
        label="Mobile number"
        error={errors.phone?.message}
        hint="10-digit Indian number"
      >
        <div className="flex">
          <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none">
            +91
          </span>
          <input
            type="tel"
            autoComplete="tel"
            placeholder="9876543210"
            maxLength={10}
            className={fieldClass(!!errors.phone) + " rounded-l-none"}
            {...register("phone")}
          />
        </div>
      </Field>

      {/* Password */}
      <Field label="Password" error={errors.password?.message}>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Create a strong password"
            className={fieldClass(!!errors.password) + " pr-10"}
            {...register("password", {
              onChange: (e) => setPasswordValue(e.target.value),
            })}
          />
          <ToggleButton
            show={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </div>
        {/* Strength checklist — visible once user starts typing */}
        {passwordValue.length > 0 && (
          <ul className="mt-2 space-y-1">
            {passwordRules.map(({ label, test }) => {
              const ok = test(passwordValue);
              return (
                <li
                  key={label}
                  className={`flex items-center gap-1.5 text-xs ${
                    ok ? "text-green-600" : "text-muted-foreground"
                  }`}
                >
                  {ok ? <Check size={12} /> : <X size={12} />}
                  {label}
                </li>
              );
            })}
          </ul>
        )}
      </Field>

      {/* Confirm password */}
      <Field label="Confirm password" error={errors.confirmPassword?.message}>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            className={fieldClass(!!errors.confirmPassword) + " pr-10"}
            {...register("confirmPassword")}
          />
          <ToggleButton
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
          />
        </div>
      </Field>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {isPending ? "Creating your account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </a>
      </p>
    </form>
  );
}

// ── Small local components ────────────────────────────────────────

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-muted-foreground">
            ({hint})
          </span>
        )}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ToggleButton({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      aria-label={show ? "Hide password" : "Show password"}
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}

function fieldClass(hasError: boolean) {
  return [
    "w-full rounded-md border px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground",
    "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
    "bg-background text-foreground",
    hasError ? "border-red-400 focus:ring-red-300" : "border-input",
  ].join(" ");
}
