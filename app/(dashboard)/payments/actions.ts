"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { paymentSchema, type PaymentInput } from "@/lib/validation";
import {
  deriveInvoiceStatus,
  invoicePending,
  recomputePartyOutstanding,
} from "@/lib/ar/balance";

type ActionResult = { error: string } | never;

export async function createPaymentAction(
  input: PaymentInput
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const data = parsed.data;

  const party = await db.party.findUnique({ where: { id: data.partyId } });
  if (!party || !canAccessParty(profile, party)) {
    return { error: "Party not found." };
  }

  const amount = new Prisma.Decimal(data.amount);

  if (data.invoiceId) {
    const invoice = await db.invoice.findUnique({ where: { id: data.invoiceId } });
    if (!invoice || invoice.partyId !== data.partyId) {
      return { error: "Invoice not found for this party." };
    }
    if (invoice.status === "CANCELLED") {
      return { error: "Cannot record a payment against a cancelled invoice." };
    }
    const pending = invoicePending(invoice);
    if (amount.greaterThan(pending)) {
      return {
        error: `Amount exceeds the pending balance on this invoice (${pending}). Record the excess as an on-account payment.`,
      };
    }

    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          partyId: data.partyId,
          invoiceId: data.invoiceId,
          amount,
          paymentDate: data.paymentDate,
          method: data.method,
          reference: data.reference,
          notes: data.notes,
          recordedById: profile.id,
        },
      });
      const newPaid = invoice.paidAmount.plus(amount);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          status: deriveInvoiceStatus(
            invoice.totalAmount,
            newPaid.plus(invoice.creditedAmount),
            invoice.dueDate
          ),
        },
      });
      await recomputePartyOutstanding(tx, data.partyId);
    });
  } else {
    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          partyId: data.partyId,
          amount,
          paymentDate: data.paymentDate,
          method: data.method,
          reference: data.reference,
          notes: data.notes,
          recordedById: profile.id,
        },
      });
      await recomputePartyOutstanding(tx, data.partyId);
    });
  }

  revalidatePath("/payments");
  revalidatePath(`/parties/${data.partyId}`);
  if (data.invoiceId) revalidatePath(`/invoices/${data.invoiceId}`);
  redirect(`/parties/${data.partyId}`);
}

// Amount, date, and allocation are immutable once recorded — the audit trail
// stays truthful. Only descriptive metadata can change.
const paymentMetaSchema = z.object({
  method: z.enum(["CASH", "CHEQUE", "NEFT", "RTGS", "UPI", "OTHER"]),
  reference: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : null)),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function updatePaymentMetaAction(
  id: string,
  input: z.input<typeof paymentMetaSchema>
): Promise<ActionResult> {
  const profile = await requireProfile();

  const payment = await db.payment.findUnique({
    where: { id },
    include: { party: { select: { assignedToId: true } } },
  });
  if (!payment || !canAccessParty(profile, payment.party)) {
    return { error: "Payment not found." };
  }

  const parsed = paymentMetaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  await db.payment.update({ where: { id }, data: parsed.data });

  revalidatePath("/payments");
  revalidatePath(`/parties/${payment.partyId}`);
  redirect("/payments");
}
