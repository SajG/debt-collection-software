"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type ProformaStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { proformaSchema, type ProformaInput } from "@/lib/validation";
import {
  deriveInvoiceStatus,
  recomputePartyOutstanding,
} from "@/lib/ar/balance";
import { buildProformaPdf } from "@/lib/pdf/build";
import { sendReminder } from "@/lib/messaging/send";

type ActionResult = { error: string } | never;

type ComputedLineItem = {
  description: string;
  quantity: Prisma.Decimal;
  unit: string | null;
  unitPrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  sortOrder: number;
};

/** All money math in Decimal, rounded to 2dp per line (standard GST practice). */
function computeLineItems(
  items: { description: string; quantity: number; unit: string | null; unitPrice: number; taxRate: number }[]
): { lineItems: ComputedLineItem[]; subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal } {
  let subtotal = new Prisma.Decimal(0);
  let taxTotal = new Prisma.Decimal(0);

  const lineItems = items.map((item, i) => {
    const qty = new Prisma.Decimal(item.quantity);
    const price = new Prisma.Decimal(item.unitPrice);
    const rate = new Prisma.Decimal(item.taxRate);
    const base = qty.times(price).toDecimalPlaces(2);
    const tax = base.times(rate).dividedBy(100).toDecimalPlaces(2);
    subtotal = subtotal.plus(base);
    taxTotal = taxTotal.plus(tax);
    return {
      description: item.description,
      quantity: qty,
      unit: item.unit,
      unitPrice: price,
      taxRate: rate,
      taxAmount: tax,
      lineTotal: base.plus(tax),
      sortOrder: i,
    };
  });

  return { lineItems, subtotal, taxAmount: taxTotal, totalAmount: subtotal.plus(taxTotal) };
}

/**
 * Next proforma number from the atomic per-year sequence on
 * BusinessSettings (PF-{YYYY}-{NNNN}). Must run inside the same
 * transaction that creates the proforma.
 */
async function nextProformaNumber(tx: Prisma.TransactionClient): Promise<string> {
  const settings = await tx.businessSettings.findFirst({
    select: { id: true, proformaSeq: true, proformaSeqYear: true },
  });
  if (!settings) throw new Error("Business settings missing");

  const year = new Date().getFullYear();
  const seq = settings.proformaSeqYear === year ? settings.proformaSeq + 1 : 1;
  await tx.businessSettings.update({
    where: { id: settings.id },
    data: { proformaSeq: seq, proformaSeqYear: year },
  });
  return `PF-${year}-${String(seq).padStart(4, "0")}`;
}

export async function createProformaAction(input: ProformaInput): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = proformaSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = parsed.data;

  const party = await db.party.findUnique({ where: { id: data.partyId } });
  if (!party || !canAccessParty(profile, party)) return { error: "Party not found." };

  const { lineItems, subtotal, taxAmount, totalAmount } = computeLineItems(data.lineItems);

  const proformaId = await db.$transaction(async (tx) => {
    const proformaNumber = await nextProformaNumber(tx);
    const proforma = await tx.proformaInvoice.create({
      data: {
        proformaNumber,
        partyId: data.partyId,
        createdById: profile.id,
        issueDate: data.issueDate,
        validUntil: data.validUntil,
        subtotal,
        taxAmount,
        totalAmount,
        notes: data.notes,
        termsConditions: data.termsConditions,
        lineItems: { create: lineItems },
      },
    });
    return proforma.id;
  });

  revalidatePath("/proformas");
  redirect(`/proformas/${proformaId}`);
}

export async function updateProformaAction(
  id: string,
  input: ProformaInput
): Promise<ActionResult> {
  const profile = await requireProfile();

  const existing = await db.proformaInvoice.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!existing || !canAccessParty(profile, existing.party)) {
    return { error: "Proforma not found." };
  }
  if (existing.status !== "DRAFT") {
    return { error: "Only draft proformas can be edited. Cancel and create a new one instead." };
  }

  const parsed = proformaSchema.safeParse({ ...input, partyId: existing.partyId });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = parsed.data;

  const { lineItems, subtotal, taxAmount, totalAmount } = computeLineItems(data.lineItems);

  await db.$transaction(async (tx) => {
    await tx.proformaLineItem.deleteMany({ where: { proformaId: id } });
    await tx.proformaInvoice.update({
      where: { id },
      data: {
        issueDate: data.issueDate,
        validUntil: data.validUntil,
        subtotal,
        taxAmount,
        totalAmount,
        notes: data.notes,
        termsConditions: data.termsConditions,
        lineItems: { create: lineItems },
      },
    });
  });

  revalidatePath("/proformas");
  revalidatePath(`/proformas/${id}`);
  redirect(`/proformas/${id}`);
}

// Legal status transitions. CONVERTED is reachable only through
// convertProformaAction, never directly.
const LEGAL_TRANSITIONS: Record<ProformaStatus, ProformaStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["CONFIRMED", "EXPIRED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  CONVERTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export async function transitionProformaAction(
  id: string,
  to: ProformaStatus
): Promise<{ error: string } | { ok: true }> {
  const profile = await requireProfile();

  const existing = await db.proformaInvoice.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!existing || !canAccessParty(profile, existing.party)) {
    return { error: "Proforma not found." };
  }
  if (!LEGAL_TRANSITIONS[existing.status].includes(to)) {
    return { error: `Cannot move a ${existing.status} proforma to ${to}.` };
  }

  await db.proformaInvoice.update({ where: { id }, data: { status: to } });

  revalidatePath("/proformas");
  revalidatePath(`/proformas/${id}`);
  return { ok: true };
}

/**
 * Email the proforma PDF to the party. Goes through sendReminder() — the
 * one send path — so the compliance gate (consent, quiet hours, caps,
 * dispute pause) applies and an audit Message row is written.
 */
export async function emailProformaPdfAction(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const profile = await requireProfile();

  const proforma = await db.proformaInvoice.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!proforma || !canAccessParty(profile, proforma.party)) {
    return { error: "Proforma not found." };
  }
  if (proforma.status === "CANCELLED" || proforma.status === "EXPIRED") {
    return { error: `A ${proforma.status.toLowerCase()} proforma cannot be emailed.` };
  }

  const pdf = await buildProformaPdf(id);
  if ("error" in pdf) return { error: pdf.error };

  const result = await sendReminder({
    partyId: proforma.partyId,
    channel: "EMAIL",
    sentById: profile.id,
    document: {
      type: "PROFORMA",
      number: proforma.proformaNumber,
      filename: pdf.filename,
      contentBase64: pdf.buffer.toString("base64"),
    },
  });

  // Emailing a draft is the act of sending it.
  if (result.status === "sent" && proforma.status === "DRAFT") {
    await db.proformaInvoice.update({ where: { id }, data: { status: "SENT" } });
  }

  revalidatePath("/proformas");
  revalidatePath(`/proformas/${id}`);
  if (result.status === "sent") return { ok: true };
  return {
    error: result.status === "blocked" ? `Blocked: ${result.reason}` : result.error,
  };
}

/** Line-item breakdown carried onto the invoice as text (Invoice has no
 *  line-item model; the proforma stays linked for the full detail). */
function lineItemBreakdown(
  items: { description: string; quantity: Prisma.Decimal; unit: string | null; unitPrice: Prisma.Decimal; taxRate: Prisma.Decimal; lineTotal: Prisma.Decimal }[]
): string {
  const lines = items.map(
    (li) =>
      `- ${li.description}: ${li.quantity}${li.unit ? ` ${li.unit}` : ""} × ₹${li.unitPrice} @ ${li.taxRate}% tax = ₹${li.lineTotal}`
  );
  return lines.join("\n");
}

export async function convertProformaAction(id: string): Promise<ActionResult> {
  const profile = await requireProfile();

  const existing = await db.proformaInvoice.findUnique({
    where: { id },
    include: { party: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!existing || !canAccessParty(profile, existing.party)) {
    return { error: "Proforma not found." };
  }
  if (existing.status !== "CONFIRMED") {
    return { error: "Only confirmed proformas can be converted to an invoice." };
  }

  const settings = await db.businessSettings.findFirst({
    select: { invoicePrefix: true, defaultCreditDays: true },
  });
  // Invoice number derives from the proforma sequence: PF-2026-0007 →
  // INV-2026-0007 (per-party uniqueness enforced by the DB).
  const prefix = settings?.invoicePrefix || "INV";
  const invoiceNumber = existing.proformaNumber.replace(/^PF/, prefix);

  const invoiceDate = new Date();
  const creditDays = existing.party.creditDays ?? settings?.defaultCreditDays ?? 30;
  const dueDate = addDays(invoiceDate, creditDays);

  let invoiceId: string;
  try {
    invoiceId = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          partyId: existing.partyId,
          invoiceNumber,
          invoiceDate,
          dueDate,
          totalAmount: existing.totalAmount,
          notes:
            `Converted from proforma ${existing.proformaNumber}.\n` +
            lineItemBreakdown(existing.lineItems),
          status: deriveInvoiceStatus(
            existing.totalAmount,
            new Prisma.Decimal(0),
            dueDate
          ),
        },
      });
      await tx.proformaInvoice.update({
        where: { id },
        data: { status: "CONVERTED", convertedToInvoiceId: invoice.id },
      });
      await recomputePartyOutstanding(tx, existing.partyId);
      return invoice.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        error: `Invoice ${invoiceNumber} already exists for this party — check the invoice list.`,
      };
    }
    throw e;
  }

  revalidatePath("/proformas");
  revalidatePath(`/proformas/${id}`);
  revalidatePath("/invoices");
  revalidatePath(`/parties/${existing.partyId}`);
  redirect(`/invoices/${invoiceId}`);
}
