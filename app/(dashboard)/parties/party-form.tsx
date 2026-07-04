"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, Field } from "../_components/ui";
import { createPartyAction, updatePartyAction } from "./actions";
import type { PartyInput } from "@/lib/validation";

export type PartyFormValues = {
  name: string;
  code: string;
  gstNumber: string;
  phone: string;
  email: string;
  contactPerson: string;
  address: string;
  city: string;
  state: string;
  creditLimit: string;
  creditDays: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  assignedToId: string;
  isActive: boolean;
};

const EMPTY: PartyFormValues = {
  name: "",
  code: "",
  gstNumber: "",
  phone: "",
  email: "",
  contactPerson: "",
  address: "",
  city: "",
  state: "",
  creditLimit: "",
  creditDays: "",
  priority: "MEDIUM",
  assignedToId: "",
  isActive: true,
};

export function PartyForm({
  partyId,
  initial,
  assignees,
}: {
  partyId?: string;
  initial?: Partial<PartyFormValues>;
  /** Present only for ADMIN users — controls the "assigned to" select. */
  assignees?: { id: string; name: string }[];
}) {
  const [values, setValues] = useState<PartyFormValues>({ ...EMPTY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof PartyFormValues>(key: K, v: PartyFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: PartyInput = { ...values };
    startTransition(async () => {
      const result = partyId
        ? await updatePartyAction(partyId, input)
        : await createPartyAction(input);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Party name *">
          <input
            className={inputCls}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
            maxLength={120}
          />
        </Field>
        <Field label="Internal code / Tally alias">
          <input
            className={inputCls}
            value={values.code}
            onChange={(e) => set("code", e.target.value)}
            maxLength={50}
          />
        </Field>
        <Field label="GSTIN">
          <input
            className={inputCls}
            value={values.gstNumber}
            onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
            maxLength={15}
            placeholder="27AAAPA1234A1Z5"
          />
        </Field>
        <Field label="Mobile number">
          <input
            className={inputCls}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            inputMode="numeric"
            maxLength={10}
            placeholder="9876543210"
          />
        </Field>
        <Field label="Email">
          <input
            className={inputCls}
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Contact person">
          <input
            className={inputCls}
            value={values.contactPerson}
            onChange={(e) => set("contactPerson", e.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="City">
          <input
            className={inputCls}
            value={values.city}
            onChange={(e) => set("city", e.target.value)}
            maxLength={100}
          />
        </Field>
        <Field label="State">
          <input
            className={inputCls}
            value={values.state}
            onChange={(e) => set("state", e.target.value)}
            maxLength={100}
          />
        </Field>
      </div>

      <Field label="Address">
        <textarea
          className={inputCls}
          rows={2}
          value={values.address}
          onChange={(e) => set("address", e.target.value)}
          maxLength={400}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Credit limit (₹)">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="0.01"
            value={values.creditLimit}
            onChange={(e) => set("creditLimit", e.target.value)}
          />
        </Field>
        <Field label="Credit days">
          <input
            className={inputCls}
            type="number"
            min={0}
            max={365}
            value={values.creditDays}
            onChange={(e) => set("creditDays", e.target.value)}
          />
        </Field>
        <Field label="Priority">
          <select
            className={inputCls}
            value={values.priority}
            onChange={(e) =>
              set("priority", e.target.value as PartyFormValues["priority"])
            }
          >
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </Field>
      </div>

      {assignees && (
        <Field label="Assigned to">
          <select
            className={inputCls}
            value={values.assignedToId}
            onChange={(e) => set("assignedToId", e.target.value)}
          >
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
          className="accent-primary"
        />
        Active party
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={btnPrimaryCls}>
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {partyId ? "Save changes" : "Add party"}
      </button>
    </form>
  );
}
