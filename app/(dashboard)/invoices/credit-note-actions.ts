"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { tenantDb, type TenantTx } from "@/lib/tenant";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { creditNoteSchema, type CreditNoteInput } from "@/lib/validation";
import {
  deriveInvoiceStatus,
  invoicePending,
  recomputePartyOutstanding,
} from "@/lib/ar/balance";

type ActionResult = { error: string } | { ok: true };

/**
 * Next credit note number — SY21: per-org, per-year OrgNumberSequence
 * counter. Must run inside the same transaction that creates the CN.
 */
async function nextCreditNoteNumber(
  tx: TenantTx,
  organizationId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const upserted = await tx.orgNumberSequence.upsert({
    where: {
      organizationId_kind_year: {
        organizationId,
        kind: "CREDIT_NOTE",
        year,
      },
    },
    create: { organizationId, kind: "CREDIT_NOTE", year, seq: 1 },
    update: { seq: { increment: 1 } },
    select: { seq: true },
  });
  return `CN-${year}-${String(upserted.seq).padStart(4, "0")}`;
}

export async function issueCreditNoteAction(
  input: CreditNoteInput
): Promise<ActionResult> {
  const profile = await requireProfile();
  const db = tenantDb(profile.organizationId);

  const parsed = creditNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const data = parsed.data;

  const invoice = await db.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { party: true },
  });
  if (!invoice || !canAccessParty(profile, invoice.party)) {
    return { error: "Invoice not found." };
  }
  if (invoice.status === "CANCELLED") {
    return { error: "Cannot credit a cancelled invoice." };
  }

  const amount = new Prisma.Decimal(data.amount);
  const pending = invoicePending(invoice);
  if (amount.greaterThan(pending)) {
    return {
      error: `Credit cannot exceed the pending balance on this invoice (${pending}).`,
    };
  }

  const organizationId = profile.organizationId;
  await db.$transaction(async (tx) => {
    const creditNoteNumber = await nextCreditNoteNumber(tx, organizationId);
    await tx.creditNote.create({
      data: {
        creditNoteNumber,
        invoiceId: invoice.id,
        partyId: invoice.partyId,
        amount,
        reason: data.reason,
        issuedById: profile.id,
      },
    });
    const newCredited = invoice.creditedAmount.plus(amount);
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        creditedAmount: newCredited,
        status: deriveInvoiceStatus(
          invoice.totalAmount,
          invoice.paidAmount.plus(newCredited),
          invoice.dueDate
        ),
      },
    });
    await recomputePartyOutstanding(tx, invoice.partyId);
  });

  revalidatePath(`/invoices/${invoice.id}`);
  revalidatePath("/invoices");
  revalidatePath(`/parties/${invoice.partyId}`);
  return { ok: true };
}

/** Reversing a financial adjustment is admin-only; the row stays for audit. */
export async function cancelCreditNoteAction(
  id: string
): Promise<ActionResult> {
  const profile = await requireProfile();
  const db = tenantDb(profile.organizationId);
  if (profile.role !== "ADMIN") {
    return { error: "Only an admin can cancel a credit note." };
  }

  const note = await db.creditNote.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!note) return { error: "Credit note not found." };
  if (note.status === "CANCELLED") {
    return { error: "This credit note is already cancelled." };
  }

  await db.$transaction(async (tx) => {
    await tx.creditNote.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledById: profile.id,
        cancelledAt: new Date(),
      },
    });
    const newCredited = note.invoice.creditedAmount.minus(note.amount);
    await tx.invoice.update({
      where: { id: note.invoiceId },
      data: {
        creditedAmount: newCredited,
        status: deriveInvoiceStatus(
          note.invoice.totalAmount,
          note.invoice.paidAmount.plus(newCredited),
          note.invoice.dueDate
        ),
      },
    });
    await recomputePartyOutstanding(tx, note.partyId);
  });

  revalidatePath(`/invoices/${note.invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath(`/parties/${note.partyId}`);
  return { ok: true };
}
