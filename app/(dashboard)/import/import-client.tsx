"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Loader2, Upload } from "lucide-react";
import { inputCls, btnPrimaryCls, btnSecondaryCls } from "../_components/ui";
import {
  importPartiesAction,
  importInvoicesAction,
  type ImportResult,
} from "./actions";

type ImportType = "parties" | "invoices";

// Target fields per import type: key = schema field, label shown in mapper.
const TARGETS: Record<
  ImportType,
  { key: string; label: string; required?: boolean }[]
> = {
  parties: [
    { key: "name", label: "Party name", required: true },
    { key: "code", label: "Code / alias" },
    { key: "gstNumber", label: "GSTIN" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "contactPerson", label: "Contact person" },
    { key: "address", label: "Address" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "creditDays", label: "Credit days" },
    { key: "tallyRef", label: "Tally ref (dedupe key)" },
  ],
  invoices: [
    { key: "partyName", label: "Party name", required: true },
    { key: "invoiceNumber", label: "Invoice number", required: true },
    { key: "invoiceDate", label: "Invoice date", required: true },
    { key: "dueDate", label: "Due date", required: true },
    { key: "totalAmount", label: "Total amount", required: true },
    { key: "notes", label: "Notes" },
    { key: "tallyRef", label: "Tally voucher ref (dedupe key)" },
  ],
};

/** Auto-match a CSV header to a target field by loose name similarity. */
function autoMatch(target: string, headers: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = norm(target);
  return (
    headers.find((h) => norm(h) === t) ??
    headers.find((h) => norm(h).includes(t) || t.includes(norm(h))) ??
    ""
  );
}

export function ImportClient() {
  const [type, setType] = useState<ImportType>("parties");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileName("");
    setResult(null);
    setError(null);
  }

  function handleFile(file: File) {
    reset();
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: ({ data, meta }) => {
        const hdrs = (meta.fields ?? []).filter(Boolean);
        if (hdrs.length === 0) {
          setError("Could not read column headers from this file.");
          return;
        }
        setHeaders(hdrs);
        setRows(data);
        const initial: Record<string, string> = {};
        for (const t of TARGETS[type]) {
          initial[t.key] = autoMatch(t.label, hdrs) || autoMatch(t.key, hdrs);
        }
        setMapping(initial);
      },
      error: () => setError("Failed to parse the CSV file."),
    });
  }

  function mappedRows(): Record<string, string>[] {
    return rows.map((row) => {
      const out: Record<string, string> = {};
      for (const t of TARGETS[type]) {
        const src = mapping[t.key];
        out[t.key] = src ? (row[src] ?? "").trim() : "";
      }
      return out;
    });
  }

  function handleImport() {
    setError(null);
    const missing = TARGETS[type].filter((t) => t.required && !mapping[t.key]);
    if (missing.length > 0) {
      setError(`Map the required column(s): ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    const payload = mappedRows();
    startTransition(async () => {
      const res =
        type === "parties"
          ? await importPartiesAction(payload)
          : await importInvoicesAction(payload);
      if ("error" in res) setError(res.error);
      else setResult(res);
    });
  }

  const preview = rows.slice(0, 5);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Type selector */}
      <div className="flex gap-2">
        {(["parties", "invoices"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setType(t);
              reset();
            }}
            className={
              t === type
                ? "rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground"
                : "rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {t === "parties" ? "Parties" : "Invoices"}
          </button>
        ))}
      </div>

      {/* File picker */}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card p-10 text-center hover:border-primary/50">
        <Upload size={22} className="text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {fileName || "Choose a CSV file"}
        </span>
        <span className="text-xs text-muted-foreground">
          Export from Tally, Zoho Books, or Excel as CSV with a header row.
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {/* Column mapping */}
      {headers.length > 0 && !result && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-sm font-semibold">Map columns</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {rows.length} data rows found. Match each SynWorks field to a column
            from your file.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TARGETS[type].map((t) => (
              <label key={t.key} className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">
                  {t.label}
                  {t.required && <span className="text-red-600"> *</span>}
                </span>
                <select
                  className={inputCls}
                  value={mapping[t.key] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [t.key]: e.target.value }))
                  }
                >
                  <option value="">— not in file —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* Preview */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {TARGETS[type].map((t) => (
                    <th
                      key={t.key}
                      className="border-b border-border px-2 py-1.5 text-left font-medium text-muted-foreground"
                    >
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {TARGETS[type].map((t) => (
                      <td key={t.key} className="border-b border-border/50 px-2 py-1.5">
                        {mapping[t.key] ? row[mapping[t.key]] : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={isPending}
              className={btnPrimaryCls}
            >
              {isPending && <Loader2 size={16} className="animate-spin" />}
              Import {rows.length} rows
            </button>
            <button type="button" onClick={reset} className={btnSecondaryCls}>
              Start over
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 text-sm font-semibold">Import complete</h2>
          <ul className="space-y-1 text-sm">
            <li className="text-emerald-700">{result.imported} imported</li>
            <li className="text-muted-foreground">
              {result.skipped} skipped (already exist)
            </li>
            <li className={result.failed > 0 ? "text-red-600" : "text-muted-foreground"}>
              {result.failed} failed
            </li>
          </ul>
          {result.errors.length > 0 && (
            <div className="mt-3 rounded-lg bg-red-50 p-3">
              <p className="mb-1 text-xs font-medium text-red-800">
                First errors (row numbers include the header row):
              </p>
              <ul className="space-y-0.5 text-xs text-red-700">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={reset} className={`${btnSecondaryCls} mt-4`}>
            Import another file
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
