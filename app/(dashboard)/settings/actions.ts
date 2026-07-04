"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { encryptSecret } from "@/lib/crypto";

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
};

export async function updateSettingsAction(
  input: SettingsInput
): Promise<{ error: string } | { saved: true }> {
  const profile = await requireAdmin();

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const { whatsappApiToken, ...data } = parsed.data;

  await db.businessSettings.upsert({
    where: { profileId: profile.id },
    create: {
      profileId: profile.id,
      onboardingDone: true,
      ...data,
      ...(whatsappApiToken ? { whatsappApiToken: encryptSecret(whatsappApiToken) } : {}),
    },
    update: {
      ...data,
      // Token is write-only: blank means "keep existing".
      ...(whatsappApiToken ? { whatsappApiToken: encryptSecret(whatsappApiToken) } : {}),
    },
  });

  revalidatePath("/settings");
  return { saved: true };
}
