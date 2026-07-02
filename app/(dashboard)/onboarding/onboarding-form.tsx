"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { saveOnboardingAction } from "./actions";

type Tool = "TALLY" | "ZOHO" | "SAP" | "EXCEL" | "OTHER";

const TOOLS: { value: Tool; label: string; description: string }[] = [
  {
    value: "TALLY",
    label: "Tally",
    description: "Tally ERP 9 or TallyPrime",
  },
  {
    value: "ZOHO",
    label: "Zoho Books",
    description: "Zoho Books or Zoho Invoice",
  },
  {
    value: "SAP",
    label: "SAP",
    description: "SAP Business One or similar",
  },
  {
    value: "EXCEL",
    label: "Excel / Google Sheets",
    description: "Spreadsheets to track invoices",
  },
  {
    value: "OTHER",
    label: "Something else",
    description: "Any other tool or paper register",
  },
];

export function OnboardingForm({ ownerName }: { ownerName: string }) {
  const [selected, setSelected] = useState<Tool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError("Please pick one before continuing.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveOnboardingAction({ accountingTool: selected });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">
          Welcome, {ownerName.split(" ")[0]}!
        </h1>
        <p className="text-sm text-muted-foreground">
          One quick question before we get started.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Which tool do you currently use to track payments?
        </legend>
        <div className="mt-2 space-y-2">
          {TOOLS.map(({ value, label, description }) => (
            <label
              key={value}
              className={[
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                selected === value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50",
              ].join(" ")}
            >
              <input
                type="radio"
                name="accountingTool"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !selected}
        className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {isPending ? "Saving…" : "Continue →"}
      </button>
    </form>
  );
}
