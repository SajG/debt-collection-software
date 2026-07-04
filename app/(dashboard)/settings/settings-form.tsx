"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, Field } from "../_components/ui";
import { updateSettingsAction, type SettingsInput } from "./actions";

export type SettingsFormValues = {
  companyGstNumber: string;
  companyAddress: string;
  companyState: string;
  companyCityPin: string;
  defaultCreditDays: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxMessagesPerDay: string;
  maxMessagesPerWeek: string;
  autoRemindersEnabled: boolean;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  whatsappTemplateName: string;
  whatsappApiToken: string;
};

export function SettingsForm({
  initial,
  tokenConfigured,
}: {
  initial: SettingsFormValues;
  tokenConfigured: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof SettingsFormValues>(k: K, v: SettingsFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSettingsAction(values as SettingsInput);
      if ("error" in result) setError(result.error);
      else {
        setSaved(true);
        setValues((prev) => ({ ...prev, whatsappApiToken: "" }));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      <Section title="Company details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="GSTIN">
            <input
              className={inputCls}
              value={values.companyGstNumber}
              onChange={(e) => set("companyGstNumber", e.target.value.toUpperCase())}
              maxLength={15}
            />
          </Field>
          <Field label="Default credit days">
            <input
              className={inputCls}
              type="number"
              min={0}
              max={365}
              value={values.defaultCreditDays}
              onChange={(e) => set("defaultCreditDays", e.target.value)}
            />
          </Field>
          <Field label="State">
            <input
              className={inputCls}
              value={values.companyState}
              onChange={(e) => set("companyState", e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="City / PIN">
            <input
              className={inputCls}
              value={values.companyCityPin}
              onChange={(e) => set("companyCityPin", e.target.value)}
              maxLength={100}
            />
          </Field>
        </div>
        <Field label="Address">
          <textarea
            className={inputCls}
            rows={2}
            value={values.companyAddress}
            onChange={(e) => set("companyAddress", e.target.value)}
            maxLength={400}
          />
        </Field>
      </Section>

      <Section
        title="Outreach guardrails"
        hint="Enforced by the sending gate on every message, manual or automated."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Timezone (IANA)">
            <input
              className={inputCls}
              value={values.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              placeholder="Asia/Kolkata"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="No sends before (hour)">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={23}
                value={values.quietHoursStart}
                onChange={(e) => set("quietHoursStart", e.target.value)}
              />
            </Field>
            <Field label="No sends after (hour)">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={24}
                value={values.quietHoursEnd}
                onChange={(e) => set("quietHoursEnd", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Max messages per party / day">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={10}
              value={values.maxMessagesPerDay}
              onChange={(e) => set("maxMessagesPerDay", e.target.value)}
            />
          </Field>
          <Field label="Max messages per party / week">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={30}
              value={values.maxMessagesPerWeek}
              onChange={(e) => set("maxMessagesPerWeek", e.target.value)}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.autoRemindersEnabled}
            onChange={(e) => set("autoRemindersEnabled", e.target.checked)}
            className="accent-primary"
          />
          Enable automated daily reminders for overdue, opted-in parties
        </label>
      </Section>

      <Section
        title="WhatsApp Business API"
        hint="Use a pre-approved UTILITY-category template. The API token is stored encrypted and never shown again."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone number ID">
            <input
              className={inputCls}
              value={values.whatsappPhoneNumberId}
              onChange={(e) => set("whatsappPhoneNumberId", e.target.value)}
              maxLength={64}
            />
          </Field>
          <Field label="Business account ID">
            <input
              className={inputCls}
              value={values.whatsappBusinessAccountId}
              onChange={(e) => set("whatsappBusinessAccountId", e.target.value)}
              maxLength={64}
            />
          </Field>
          <Field label="Utility template name">
            <input
              className={inputCls}
              value={values.whatsappTemplateName}
              onChange={(e) => set("whatsappTemplateName", e.target.value)}
              placeholder="payment_reminder_utility"
              maxLength={128}
            />
          </Field>
          <Field label="API token">
            <input
              className={inputCls}
              type="password"
              value={values.whatsappApiToken}
              onChange={(e) => set("whatsappApiToken", e.target.value)}
              placeholder={
                tokenConfigured ? "Configured — enter to replace" : "Paste token"
              }
              autoComplete="off"
            />
          </Field>
        </div>
      </Section>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-700">
          Settings saved.
        </p>
      )}

      <button type="submit" disabled={isPending} className={btnPrimaryCls}>
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Save settings
      </button>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
