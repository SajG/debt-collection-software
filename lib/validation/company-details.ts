import { z } from "zod";
import { INDIA_STATES, INDUSTRIES, TEAM_SIZES } from "@/lib/india-states";
import { isValidGstin, normalizeGstin } from "@/lib/validation/gstin";

// SY42 — the company + owner details asked for at sign-up (both the
// password and Google paths). Shared by the server actions and, via the
// same shape, the client form.

const FAKE_DOMAIN_RE = /\.(local|test|invalid|internal|localhost|example)$/i;

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const companyDetailsSchema = z.object({
  ownerName: z.string().trim().min(2, "Enter your name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid work email")
    .max(254)
    .refine((v) => !FAKE_DOMAIN_RE.test(v), "Use a real deliverable email address."),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  designation: z.preprocess(blank, z.string().trim().max(60).optional()),
  companyName: z.string().trim().min(2, "Enter your company name").max(120),
  gstin: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? normalizeGstin(v) : v),
    z.string().refine(isValidGstin, "That GSTIN doesn't look right. Check it, or leave it blank.").optional(),
  ),
  address: z.preprocess(blank, z.string().trim().max(300).optional()),
  city: z.string().trim().min(2, "Enter your city").max(80),
  state: z.enum(INDIA_STATES, { errorMap: () => ({ message: "Choose your state" }) }),
  pincode: z.preprocess(blank, z.string().trim().regex(/^\d{6}$/, "Pincode is 6 digits").optional()),
  industry: z.enum(INDUSTRIES, { errorMap: () => ({ message: "Choose your industry" }) }),
  teamSize: z.preprocess(blank, z.enum(TEAM_SIZES).optional()),
});

/** Raw form values (all strings) before validation. */
export type CompanyDetailsInput = Record<string, string | undefined>;
export type CompanyDetails = z.output<typeof companyDetailsSchema>;
