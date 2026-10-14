"use client";

import { INDIA_STATES, INDUSTRIES, TEAM_SIZES } from "@/lib/india-states";

// SY42 — the owner + company fields shared by /signup and
// /signup/complete. Pure presentation; validation is server-side
// (lib/validation/company-details.ts) with light client checks for
// instant feedback.

export type CompanyForm = {
  ownerName: string;
  email: string;
  phone: string;
  designation: string;
  companyName: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  industry: string;
  teamSize: string;
};

export const emptyCompanyForm: CompanyForm = {
  ownerName: "", email: "", phone: "", designation: "", companyName: "",
  gstin: "", address: "", city: "", state: "", pincode: "", industry: "", teamSize: "",
};

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First problem found, or null. Server re-validates everything. */
export function firstFormError(f: CompanyForm, needEmail = true): string | null {
  if (f.ownerName.trim().length < 2) return "Enter your name.";
  if (needEmail && !EMAIL_RE.test(f.email.trim())) return "Enter a valid work email.";
  if (!PHONE_RE.test(f.phone.replace(/\D/g, "").slice(-10))) return "Enter a 10-digit Indian mobile number.";
  if (f.companyName.trim().length < 2) return "Enter your company name.";
  if (!f.city.trim()) return "Enter your city.";
  if (!f.state) return "Choose your state.";
  if (!f.industry) return "Choose your industry.";
  return null;
}

export function normalizeForm(f: CompanyForm) {
  return { ...f, phone: f.phone.replace(/\D/g, "").slice(-10), gstin: f.gstin.trim().toUpperCase() };
}

export function CompanyFields({
  value,
  onChange,
  lockEmail,
}: {
  value: CompanyForm;
  onChange: (next: CompanyForm) => void;
  lockEmail?: boolean;
}) {
  const set = (k: keyof CompanyForm) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <Field label="Your name" value={value.ownerName} onChange={set("ownerName")} autoComplete="name" />
      <Field
        label="Work email"
        value={value.email}
        onChange={set("email")}
        type="email"
        autoComplete="email"
        disabled={lockEmail}
      />
      <Field
        label="Mobile (10-digit)"
        value={value.phone}
        onChange={set("phone")}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        prefix="+91"
      />
      <Field
        label="Your role (optional)"
        value={value.designation}
        onChange={set("designation")}
        placeholder="Owner, Director, Sales head…"
      />
      <hr className="border-border" />
      <Field label="Company name" value={value.companyName} onChange={set("companyName")} autoComplete="organization" />
      <Field
        label="GSTIN (optional)"
        value={value.gstin}
        onChange={set("gstin")}
        placeholder="27AAPFU0939F1ZV"
        maxLength={15}
        autoCapitalize="characters"
      />
      <Field label="Address (optional)" value={value.address} onChange={set("address")} autoComplete="street-address" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" value={value.city} onChange={set("city")} autoComplete="address-level2" />
        <Field label="Pincode (optional)" value={value.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} autoComplete="postal-code" />
      </div>
      <Select label="State" value={value.state} onChange={set("state")} options={INDIA_STATES} />
      <Select label="Industry" value={value.industry} onChange={set("industry")} options={INDUSTRIES} />
      <Select label="Team size (optional)" value={value.teamSize} onChange={set("teamSize")} options={TEAM_SIZES} />
    </div>
  );
}

export function Field({
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
      <div className="flex items-stretch rounded-md border border-input bg-background">
        {prefix && (
          <span className="flex items-center rounded-l-md border-r bg-muted px-3 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60"
          {...rest}
        />
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
