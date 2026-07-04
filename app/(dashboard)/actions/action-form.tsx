"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, Field } from "../_components/ui";
import { createFollowUpAction, updateFollowUpAction } from "./actions";
import type { ActionInput } from "@/lib/validation";

export type ActionFormValues = {
  partyId: string;
  type: string;
  outcome: string;
  notes: string;
  contactedPerson: string;
  promiseDate: string;
  promiseAmount: string;
  nextFollowUpDate: string;
};

export function ActionForm({
  actionId,
  initial,
  parties,
}: {
  actionId?: string;
  initial?: Partial<ActionFormValues>;
  parties?: { id: string; name: string }[];
}) {
  const [values, setValues] = useState<ActionFormValues>({
    partyId: "",
    type: "CALL",
    outcome: "",
    notes: "",
    contactedPerson: "",
    promiseDate: "",
    promiseAmount: "",
    nextFollowUpDate: "",
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof ActionFormValues>(k: K, v: ActionFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  const showPromise = values.outcome === "PROMISE_TO_PAY";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = values as ActionInput;
    startTransition(async () => {
      const result = actionId
        ? await updateFollowUpAction(actionId, input)
        : await createFollowUpAction(input);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      {parties && (
        <Field label="Party *">
          <select
            className={inputCls}
            value={values.partyId}
            onChange={(e) => set("partyId", e.target.value)}
            required
          >
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type *">
          <select
            className={inputCls}
            value={values.type}
            onChange={(e) => set("type", e.target.value)}
          >
            <option value="CALL">Phone call</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Email</option>
            <option value="VISIT">Visit</option>
            <option value="NOTE">Note</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Outcome">
          <select
            className={inputCls}
            value={values.outcome}
            onChange={(e) => set("outcome", e.target.value)}
          >
            <option value="">—</option>
            <option value="PROMISE_TO_PAY">Promised to pay</option>
            <option value="CALL_BACK_LATER">Call back later</option>
            <option value="NOT_REACHABLE">Not reachable</option>
            <option value="NO_ANSWER">No answer</option>
            <option value="DISPUTED">Disputed</option>
            <option value="PAYMENT_RECEIVED">Payment received</option>
            <option value="WRONG_NUMBER">Wrong number</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Contacted person">
          <input
            className={inputCls}
            value={values.contactedPerson}
            onChange={(e) => set("contactedPerson", e.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="Next follow-up date">
          <input
            className={inputCls}
            type="date"
            value={values.nextFollowUpDate}
            onChange={(e) => set("nextFollowUpDate", e.target.value)}
          />
        </Field>
      </div>

      {showPromise && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
          <Field label="Promised date">
            <input
              className={inputCls}
              type="date"
              value={values.promiseDate}
              onChange={(e) => set("promiseDate", e.target.value)}
            />
          </Field>
          <Field label="Promised amount (₹)">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              value={values.promiseAmount}
              onChange={(e) => set("promiseAmount", e.target.value)}
            />
          </Field>
        </div>
      )}

      {values.outcome === "DISPUTED" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Recording a dispute pauses all automated reminders to this party until
          an admin clears it.
        </p>
      )}

      <Field label="Notes">
        <textarea
          className={inputCls}
          rows={3}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={2000}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={btnPrimaryCls}>
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {actionId ? "Save changes" : "Log follow-up"}
      </button>
    </form>
  );
}
