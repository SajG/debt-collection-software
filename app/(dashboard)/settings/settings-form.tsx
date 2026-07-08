"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputCls, btnPrimaryCls, btnSecondaryCls, Field } from "../_components/ui";
import { updateSettingsAction, uploadLogoAction, type SettingsInput } from "./actions";

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
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfscCode: string;
  bankName: string;
  bankBranch: string;
  invoicePrefix: string;
  authorizedSignatoryName: string;
};

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Longest edge after client-side resize; plenty for a PDF letterhead. */
const LOGO_MAX_DIMENSION = 512;

/** Downscale/compress PNG & JPG in the browser before upload; SVGs pass
 *  through untouched (vector, already small or rejected by the size cap). */
async function compressLogo(file: File): Promise<File> {
  if (file.type === "image/svg+xml") return file;
  if (file.type !== "image/png" && file.type !== "image/jpeg") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= LOGO_MAX_BYTES) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, file.type, 0.9)
  );
  if (!blob) return file;
  return new File([blob], file.name, { type: file.type });
}

export function SettingsForm({
  initial,
  tokenConfigured,
  bankAccountConfigured,
  logoUrl,
}: {
  initial: SettingsFormValues;
  tokenConfigured: boolean;
  bankAccountConfigured: boolean;
  /** Short-lived signed URL for the settings preview; null when no logo. */
  logoUrl: string | null;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoUploading, startLogoTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);

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
        setValues((prev) => ({ ...prev, whatsappApiToken: "", bankAccountNumber: "" }));
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
        title="Company branding & bank details"
        hint="Shown on proforma and invoice PDFs. The account number is stored encrypted and never shown again."
      >
        <div className="flex items-start gap-4">
          {logoUrl ? (
            // Signed URL from a private bucket — next/image remote patterns
            // don't apply; plain img keeps the preview simple.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Company logo"
              className="h-16 w-16 rounded-md border border-border object-contain bg-white"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
              No logo
            </div>
          )}
          <div className="space-y-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLogoError(null);
                startLogoTransition(async () => {
                  const compressed = await compressLogo(file);
                  if (compressed.size > LOGO_MAX_BYTES) {
                    setLogoError("Logo must be 2MB or smaller.");
                    return;
                  }
                  const fd = new FormData();
                  fd.append("logo", compressed);
                  const result = await uploadLogoAction(fd);
                  if ("error" in result) setLogoError(result.error);
                });
              }}
            />
            <button
              type="button"
              className={btnSecondaryCls}
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoUploading && <Loader2 size={16} className="animate-spin" />}
              {logoUrl ? "Replace logo" : "Upload logo"}
            </button>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, or SVG · up to 2MB · resized automatically
            </p>
            {logoError && (
              <p role="alert" className="text-sm text-red-600">
                {logoError}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Account holder name">
            <input
              className={inputCls}
              value={values.bankAccountName}
              onChange={(e) => set("bankAccountName", e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Account number">
            <input
              className={inputCls}
              type="password"
              value={values.bankAccountNumber}
              onChange={(e) =>
                set("bankAccountNumber", e.target.value.replace(/\D/g, ""))
              }
              placeholder={
                bankAccountConfigured ? "Configured — enter to replace" : "9–18 digits"
              }
              autoComplete="off"
              maxLength={18}
            />
          </Field>
          <Field label="IFSC code">
            <input
              className={inputCls}
              value={values.bankIfscCode}
              onChange={(e) => set("bankIfscCode", e.target.value.toUpperCase())}
              maxLength={11}
            />
          </Field>
          <Field label="Bank name">
            <input
              className={inputCls}
              value={values.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Branch">
            <input
              className={inputCls}
              value={values.bankBranch}
              onChange={(e) => set("bankBranch", e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Invoice number prefix">
            <input
              className={inputCls}
              value={values.invoicePrefix}
              onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())}
              placeholder="INV"
              maxLength={10}
            />
          </Field>
          <Field label="Authorized signatory name">
            <input
              className={inputCls}
              value={values.authorizedSignatoryName}
              onChange={(e) => set("authorizedSignatoryName", e.target.value)}
              maxLength={120}
            />
          </Field>
        </div>
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
