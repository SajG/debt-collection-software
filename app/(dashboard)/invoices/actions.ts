"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { invoiceSchema, type InvoiceInput } from "@/lib/validation";
import {
  deriveInvoiceStatus,
  recomputePartyOutstanding,
} from "@/lib/ar/balance";
import { buildInvoicePdf } from "@/lib/pdf/build";
import { sendReminder } from "@/lib/messaging/send";

type ActionResult = { error: string } | never;

export async function createInvoiceAction(
  input: InvoiceInput
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const data = parsed.data;

  const party = await db.party.findUnique({ where: { id: data.partyId } });
  if (!party || !canAccessParty(profile, party)) {
    return { error: "Party not found." };
  }

  const total = new Prisma.Decimal(data.totalAmount);
  let invoiceId: string;
  try {
    invoiceId = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          partyId: data.partyId,
          invoiceNumber: data.invoiceNumber,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          totalAmount: total,
          notes: data.notes,
          status: deriveInvoiceStatus(total, new Prisma.Decimal(0), data.dueDate),
        },
      });
      await recomputePartyOutstanding(tx, data.partyId);
      return invoice.id;
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        error: `Invoice ${data.invoiceNumber} already exists for this party.`,
      };
    }
    throw e;
  }

  revalidatePath("/invoices");
  revalidatePath(`/parties/${data.partyId}`);
  redirect(`/invoices/${invoiceId}`);
}

export async function updateInvoiceAction(
  id: string,
  input: InvoiceInput
): Promise<ActionResult> {
  const profile = await requireProfile();

  const existing = await db.invoice.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!existing || !canAccessParty(profile, existing.party)) {
    return { error: "Invoice not found." };
  }
  if (existing.status === "CANCELLED") {
    return { error: "Cancelled invoices cannot be edited." };
  }

  const parsed = invoiceSchema.safeParse({ ...input, partyId: existing.partyId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const data = parsed.data;

  const total = new Prisma.Decimal(data.totalAmount);
  if (total.lessThan(existing.paidAmount)) {
    return {
      error: `Total cannot be below the amount already paid (${existing.paidAmount}).`,
    };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber: data.invoiceNumber,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          totalAmount: total,
          notes: data.notes,
          status: deriveInvoiceStatus(total, existing.paidAmount, data.dueDate),
        },
      });
      await recomputePartyOutstanding(tx, existing.partyId);
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        error: `Invoice ${data.invoiceNumber} already exists for this party.`,
      };
    }
    throw e;
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath(`/parties/${existing.partyId}`);
  redirect(`/invoices/${id}`);
}

/**
 * Email the invoice PDF to the party. Goes through sendReminder() — the
 * one send path — so the compliance gate applies and an audit Message row
 * is written.
 */
export async function emailInvoicePdfAction(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const profile = await requireProfile();

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!invoice || !canAccessParty(profile, invoice.party)) {
    return { error: "Invoice not found." };
  }
  if (invoice.status === "CANCELLED") {
    return { error: "Cancelled invoices cannot be emailed." };
  }

  const pdf = await buildInvoicePdf(id);
  if ("error" in pdf) return { error: pdf.error };

  const result = await sendReminder({
    partyId: invoice.partyId,
    channel: "EMAIL",
    invoiceId: id,
    sentById: profile.id,
    document: {
      type: "INVOICE",
      number: invoice.invoiceNumber,
      filename: pdf.filename,
      contentBase64: pdf.buffer.toString("base64"),
    },
  });

  revalidatePath(`/invoices/${id}`);
  if (result.status === "sent") return { ok: true };
  return {
    error: result.status === "blocked" ? `Blocked: ${result.reason}` : result.error,
  };
}

export async function cancelInvoiceAction(id: string): Promise<ActionResult> {
  const profile = await requireProfile();

  const existing = await db.invoice.findUnique({
    where: { id },
    include: { party: true },
  });
  if (!existing || !canAccessParty(profile, existing.party)) {
    return { error: "Invoice not found." };
  }
  if (existing.paidAmount.greaterThan(0)) {
    return { error: "Invoices with payments against them cannot be cancelled." };
  }

  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
    await recomputePartyOutstanding(tx, existing.partyId);
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath(`/parties/${existing.partyId}`);
  redirect("/invoices");
}
