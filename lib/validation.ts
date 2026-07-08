import { z } from "zod";

/** "" → null so optional form fields map cleanly onto nullable columns. */
const optionalTrimmed = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const optionalNumber = (opts?: { int?: boolean; max?: number }) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z
      .number()
      .min(0)
      .max(opts?.max ?? 10_000_000_000)
      .refine((n) => !opts?.int || Number.isInteger(n), "Must be a whole number")
      .nullable()
  );

const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : new Date(String(v))),
  z.date().nullable()
);

const money = z.coerce
  .number()
  .positive("Amount must be greater than zero")
  .max(10_000_000_000);

// ── Party ────────────────────────────────────────────────────────

export const partySchema = z.object({
  name: z.string().trim().min(2, "Enter the party name").max(120),
  code: optionalTrimmed(50),
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][A-Z][0-9A-Z]$/,
      "Enter a valid 15-character GSTIN"
    )
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  contactPerson: optionalTrimmed(120),
  address: optionalTrimmed(400),
  city: optionalTrimmed(100),
  state: optionalTrimmed(100),
  creditLimit: optionalNumber(),
  creditDays: optionalNumber({ int: true, max: 365 }),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  assignedToId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  isActive: z.coerce.boolean().default(true),
});

export type PartyInput = z.input<typeof partySchema>;

// ── Invoice ──────────────────────────────────────────────────────

export const invoiceSchema = z
  .object({
    partyId: z.string().min(1, "Pick a party"),
    invoiceNumber: z.string().trim().min(1, "Enter the invoice number").max(50),
    invoiceDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    totalAmount: money,
    notes: optionalTrimmed(1000),
  })
  .refine((d) => d.dueDate >= d.invoiceDate, {
    message: "Due date cannot be before the invoice date",
    path: ["dueDate"],
  });

// Form-facing input shape: forms submit strings; z.coerce handles conversion.
export type InvoiceInput = {
  partyId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  notes?: string;
};

// ── Payment ──────────────────────────────────────────────────────

export const paymentSchema = z.object({
  partyId: z.string().min(1, "Pick a party"),
  amount: money,
  paymentDate: z.coerce.date(),
  method: z.enum(["CASH", "CHEQUE", "NEFT", "RTGS", "UPI", "OTHER"]),
  reference: optionalTrimmed(100),
  notes: optionalTrimmed(1000),
  invoiceId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export type PaymentInput = {
  partyId: string;
  amount: string;
  paymentDate: string;
  method: "CASH" | "CHEQUE" | "NEFT" | "RTGS" | "UPI" | "OTHER";
  reference?: string;
  notes?: string;
  invoiceId?: string;
};

// ── Proforma invoice ─────────────────────────────────────────────

const proformaLineItemSchema = z.object({
  description: z.string().trim().min(1, "Line items need a description").max(300),
  quantity: z.coerce
    .number()
    .positive("Quantity must be greater than zero")
    .max(1_000_000),
  unit: optionalTrimmed(20),
  unitPrice: z.coerce.number().min(0).max(10_000_000_000),
  taxRate: z.coerce
    .number()
    .min(0)
    .max(100, "Tax rate is a percentage (0–100)"),
});

export const proformaSchema = z.object({
  partyId: z.string().min(1, "Pick a party"),
  issueDate: z.coerce.date(),
  validUntil: optionalDate,
  notes: optionalTrimmed(1000),
  termsConditions: optionalTrimmed(2000),
  lineItems: z
    .array(proformaLineItemSchema)
    .min(1, "Add at least one line item")
    .max(50),
});

// Form-facing input shape: forms submit strings; z.coerce handles conversion.
export type ProformaLineItemInput = {
  description: string;
  quantity: string;
  unit?: string;
  unitPrice: string;
  taxRate: string;
};

export type ProformaInput = {
  partyId: string;
  issueDate: string;
  validUntil?: string;
  notes?: string;
  termsConditions?: string;
  lineItems: ProformaLineItemInput[];
};

// ── Credit note ──────────────────────────────────────────────────

export const creditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  amount: money,
  reason: z.string().trim().min(3, "Give a reason for the credit").max(500),
});

export type CreditNoteInput = {
  invoiceId: string;
  amount: string;
  reason: string;
};

// ── Action / follow-up ───────────────────────────────────────────

export const actionSchema = z.object({
  partyId: z.string().min(1, "Pick a party"),
  type: z.enum(["CALL", "WHATSAPP", "EMAIL", "VISIT", "NOTE", "OTHER"]),
  outcome: z
    .enum([
      "PROMISE_TO_PAY",
      "NOT_REACHABLE",
      "CALL_BACK_LATER",
      "DISPUTED",
      "PAYMENT_RECEIVED",
      "NO_ANSWER",
      "WRONG_NUMBER",
      "OTHER",
    ])
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  notes: optionalTrimmed(2000),
  contactedPerson: optionalTrimmed(120),
  promiseDate: optionalDate,
  promiseAmount: optionalNumber(),
  nextFollowUpDate: optionalDate,
});

export type ActionInput = z.input<typeof actionSchema>;
