"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { encryptSecret } from "@/lib/crypto";
import { uploadCompanyLogo, LOGO_MAX_BYTES } from "@/lib/storage";

const optional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const settingsSchema = z
  .object({
    companyGstNumber: optional(15),
    companyAddress: optional(400),
    companyState: optional(100),
    companyCityPin: optional(100),
    defaultCreditDays: z.preprocess(
      (v) => (v === "" || v == null ? null : parseInt(String(v), 10)),
      z.number().int().min(0).max(365).nullable()
    ),

    timezone: z.string().trim().min(1).max(64),
    quietHoursStart: z.coerce.number().int().min(0).max(23),
    quietHoursEnd: z.coerce.number().int().min(1).max(24),
    maxMessagesPerDay: z.coerce.number().int().min(1).max(10),
    maxMessagesPerWeek: z.coerce.number().int().min(1).max(30),
    autoRemindersEnabled: z.coerce.boolean(),

    whatsappPhoneNumberId: optional(64),
    whatsappBusinessAccountId: optional(64),
    whatsappTemplateName: optional(128),
    /** Blank = keep the currently stored (encrypted) token. */
    whatsappApiToken: z.string().trim().max(512).optional(),

    // Company branding & bank details (rendered on PDFs)
    bankAccountName: optional(120),
    /** Blank = keep the currently stored (encrypted) account number. */
    bankAccountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, "Bank account number must be 9–18 digits")
      .optional()
      .or(z.literal("")),
    bankIfscCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid 11-character IFSC code")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    bankName: optional(120),
    bankBranch: optional(120),
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{0,10}$/, "Prefix may contain letters, digits, and dashes")
      .optional()
      .transform((v) => (v ? v : null)),
    authorizedSignatoryName: optional(120),
  })
  .refine((d) => d.quietHoursEnd > d.quietHoursStart, {
    message: "Quiet-hours end must be after the start",
    path: ["quietHoursEnd"],
  })
  .refine(
    (d) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: d.timezone });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Enter a valid IANA timezone (e.g. Asia/Kolkata)", path: ["timezone"] }
  );

// Form-facing input shape: forms submit strings; z.coerce handles conversion.
export type SettingsInput = {
  companyGstNumber?: string;
  companyAddress?: string;
  companyState?: string;
  companyCityPin?: string;
  defaultCreditDays?: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxMessagesPerDay: string;
  maxMessagesPerWeek: string;
  autoRemindersEnabled: boolean;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappTemplateName?: string;
  whatsappApiToken?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankName?: string;
  bankBranch?: string;
  invoicePrefix?: string;
  authorizedSignatoryName?: string;
};

export async function updateSettingsAction(
  input: SettingsInput
): Promise<{ error: string } | { saved: true }> {
  const profile = await requireAdmin();

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const { whatsappApiToken, bankAccountNumber, ...data } = parsed.data;

  // Both secrets are write-only: blank means "keep existing".
  const secrets = {
    ...(whatsappApiToken ? { whatsappApiToken: encryptSecret(whatsappApiToken) } : {}),
    ...(bankAccountNumber ? { bankAccountNumber: encryptSecret(bankAccountNumber) } : {}),
  };

  await db.businessSettings.upsert({
    where: { profileId: profile.id },
    create: {
      profileId: profile.id,
      onboardingDone: true,
      ...data,
      ...secrets,
    },
    update: {
      ...data,
      ...secrets,
    },
  });

  revalidatePath("/settings");
  return { saved: true };
}

export async function uploadLogoAction(
  formData: FormData
): Promise<{ error: string } | { saved: true }> {
  const profile = await requireAdmin();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a logo file to upload." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: "Logo must be 2MB or smaller." };
  }

  const settings = await db.businessSettings.findUnique({
    where: { profileId: profile.id },
    select: { companyLogoPath: true },
  });

  const result = await uploadCompanyLogo(
    { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type },
    settings?.companyLogoPath ?? null
  );
  if ("error" in result) return result;

  await db.businessSettings.upsert({
    where: { profileId: profile.id },
    create: { profileId: profile.id, companyLogoPath: result.path },
    update: { companyLogoPath: result.path },
  });

  revalidatePath("/settings");
  return { saved: true };
}
