"use client";

import { mkt } from "@/components/marketing/tokens";

// Small form controls shared by the calculators.

const inputCls =
  "mt-1 w-full rounded-lg border bg-white px-3 py-2.5 text-base outline-none focus:ring-2";
const border = { borderColor: mkt.border, color: mkt.ink };

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold" style={{ color: mkt.ink }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-sm" style={{ color: mkt.ink2 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
      style={border}
    />
  );
}

export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} style={border} />
  );
}

export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2" style={{ borderColor: mkt.bgAlt }}>
      <span className="text-base" style={{ color: mkt.ink2 }}>
        {label}
      </span>
      <span className={strong ? "text-xl font-bold" : "text-base font-semibold"} style={{ color: mkt.ink }}>
        {value}
      </span>
    </div>
  );
}
