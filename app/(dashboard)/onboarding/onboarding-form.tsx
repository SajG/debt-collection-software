"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  saveCompanyStep,
  saveTeamStep,
  saveDataStep,
  completeOnboardingAction,
} from "./actions";

// SY23 — 4-step wizard. Skippable. Progress lives in
// BusinessSettings.onboardingStep so a mid-wizard sign-out resumes.

const INDUSTRIES = [
  "Adhesives/Chemicals",
  "Paints",
  "Pipes & fittings",
  "Electrical",
  "FMCG distribution",
  "Pharma distribution",
  "Other",
] as const;

const ROLE_HINTS: Record<"ADMIN" | "STAFF" | "FACTORY", { label: string; hint: string }> = {
  ADMIN: {
    label: "Management",
    hint: "sees everything, approves orders, manages team",
  },
  STAFF: {
    label: "Sales",
    hint: "places orders, records payments, follows up with their customers",
  },
  FACTORY: {
    label: "Factory",
    hint: "sees orders to produce and dispatch",
  },
};

type Step = "company" | "team" | "data" | "done";

type TeamRow = {
  ownerName: string;
  phone: string;
  email: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
};

export function OnboardingForm({
  startAt,
  initialCompany,
}: {
  startAt: Step;
  initialCompany: {
    companyName: string;
    gstin: string;
    city: string;
    state: string;
    industry: (typeof INDUSTRIES)[number];
  };
}) {
  const [step, setStep] = useState<Step>(startAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <ol className="mb-8 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        {(["company", "team", "data", "done"] as Step[]).map((s, i) => (
          <li
            key={s}
            className={
              s === step
                ? "font-semibold text-primary"
                : i < (["company", "team", "data", "done"] as Step[]).indexOf(step)
                  ? "text-foreground"
                  : ""
            }
          >
            {i + 1}. {s === "company" ? "Company" : s === "team" ? "Team" : s === "data" ? "Data" : "Done"}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      {step === "company" && (
        <CompanyStep
          pending={pending}
          initial={initialCompany}
          onSkip={() => setStep("team")}
          onSubmit={(v) =>
            startTransition(async () => {
              setError(null);
              const res = await saveCompanyStep(v);
              if ("error" in res) setError(res.error);
              else setStep("team");
            })
          }
        />
      )}

      {step === "team" && (
        <TeamStep
          pending={pending}
          onSkip={() => setStep("data")}
          onSubmit={(members) =>
            startTransition(async () => {
              setError(null);
              const res = await saveTeamStep({ members });
              if (res && "error" in res) setError(res.error);
              setStep("data");
            })
          }
        />
      )}

      {step === "data" && (
        <DataStep
          pending={pending}
          onChoose={(choice) =>
            startTransition(async () => {
              setError(null);
              const res = await saveDataStep({ choice });
              if (res && "error" in res) setError(res.error);
              setStep("done");
            })
          }
        />
      )}

      {step === "done" && (
        <DoneStep
          pending={pending}
          onFinish={() => startTransition(async () => completeOnboardingAction())}
        />
      )}
    </div>
  );
}

function CompanyStep({
  pending,
  initial,
  onSkip,
  onSubmit,
}: {
  pending: boolean;
  initial: {
    companyName: string;
    gstin: string;
    city: string;
    state: string;
    industry: (typeof INDUSTRIES)[number];
  };
  onSkip: () => void;
  onSubmit: (v: {
    companyName: string;
    gstin?: string;
    city?: string;
    state?: string;
    industry: (typeof INDUSTRIES)[number];
  }) => void;
}) {
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [gstin, setGstin] = useState(initial.gstin);
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [industry, setIndustry] = useState(initial.industry);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          companyName: companyName.trim(),
          gstin: gstin.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          industry,
        });
      }}
    >
      <h2 className="text-xl font-semibold">About your company</h2>
      <Field label="Company name" value={companyName} onChange={setCompanyName} required />
      <Field label="GSTIN (optional)" value={gstin} onChange={setGstin} placeholder="27ABCDE1234F1Z5" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" value={city} onChange={setCity} />
        <Field label="State" value={state} onChange={setState} />
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Industry</span>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value as (typeof INDUSTRIES)[number])}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <Row>
        <button type="button" onClick={onSkip} className="text-sm text-muted-foreground">
          Skip
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Next
        </button>
      </Row>
    </form>
  );
}

function TeamStep({
  pending,
  onSkip,
  onSubmit,
}: {
  pending: boolean;
  onSkip: () => void;
  onSubmit: (members: TeamRow[]) => void;
}) {
  const [rows, setRows] = useState<TeamRow[]>([
    { ownerName: "", phone: "", email: "", role: "STAFF" },
  ]);

  function updateRow(i: number, patch: Partial<TeamRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { ownerName: "", phone: "", email: "", role: "STAFF" }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Invite your team</h2>
      <p className="text-sm text-muted-foreground">
        Each teammate gets a code emailed to sign in. Add rows now or skip and invite later from Admin → Users.
      </p>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                compact
                label="Name"
                value={row.ownerName}
                onChange={(v) => updateRow(i, { ownerName: v })}
              />
              <Field
                compact
                label="Mobile (10-digit)"
                value={row.phone}
                onChange={(v) => updateRow(i, { phone: v.replace(/\D/g, "").slice(-10) })}
              />
              <Field
                compact
                label="Email"
                type="email"
                value={row.email}
                onChange={(v) => updateRow(i, { email: v })}
              />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Role</span>
                <select
                  value={row.role}
                  onChange={(e) => updateRow(i, { role: e.target.value as TeamRow["role"] })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {(["ADMIN", "STAFF", "FACTORY"] as const).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_HINTS[r].label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {ROLE_HINTS[row.role].hint}
                </span>
              </label>
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="mt-2 flex items-center gap-1 text-xs text-red-600 hover:underline"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <Plus size={14} /> Add another
      </button>
      <Row>
        <button type="button" onClick={onSkip} className="text-sm text-muted-foreground">
          Skip
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSubmit(rows.filter((r) => r.ownerName && r.email && r.phone))}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Send invites
        </button>
      </Row>
    </div>
  );
}

function DataStep({
  pending,
  onChoose,
}: {
  pending: boolean;
  onChoose: (choice: "TALLY" | "EXCEL" | "SAMPLE" | "SKIP") => void;
}) {
  const cards: {
    id: "TALLY" | "EXCEL" | "SAMPLE";
    title: string;
    body: string;
    cta: string;
  }[] = [
    {
      id: "TALLY",
      title: "Connect Tally",
      body: "Install our lightweight sync agent on the Windows machine that runs Tally. One-time pairing code.",
      cta: "Connect Tally",
    },
    {
      id: "EXCEL",
      title: "Upload Excel",
      body: "Import your parties, invoices and payments from a spreadsheet. We provide a template.",
      cta: "Import CSV",
    },
    {
      id: "SAMPLE",
      title: "Try with sample data",
      body: "We'll add a handful of demo parties + invoices so you can click around. Delete anytime.",
      cta: "Load sample",
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Bring in your data</h2>
      <p className="text-sm text-muted-foreground">
        You can change this later — nothing here is permanent.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() => onChoose(c.id)}
            className="flex flex-col rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary disabled:opacity-60"
          >
            <span className="text-base font-semibold text-foreground">{c.title}</span>
            <span className="mt-1 text-xs text-muted-foreground">{c.body}</span>
            <span className="mt-3 text-sm font-semibold text-primary">{c.cta} →</span>
          </button>
        ))}
      </div>
      <Row>
        <button
          type="button"
          onClick={() => onChoose("SKIP")}
          className="text-sm text-muted-foreground"
        >
          Skip for now
        </button>
        <span />
      </Row>
    </div>
  );
}

function DoneStep({ pending, onFinish }: { pending: boolean; onFinish: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <h2 className="text-xl font-semibold">You&apos;re all set 🎉</h2>
      <p className="text-sm text-muted-foreground">
        Head to your dashboard — the setup checklist stays visible until every step is complete.
      </p>
      <button
        type="button"
        onClick={onFinish}
        disabled={pending}
        className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        Go to dashboard
      </button>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex items-center justify-between">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  compact,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "block text-xs" : "block text-sm"}>
      <span className={compact ? "mb-0.5 block font-medium text-foreground" : "mb-1 block font-medium"}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
