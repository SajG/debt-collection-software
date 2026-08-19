"use server";

import type { PaymentDocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import {
  uploadPaymentDocument,
  PAYMENT_DOC_MAX_BYTES,
  PAYMENT_DOC_ALLOWED_TYPES,
} from "@/lib/storage";

const VALID_TYPES: PaymentDocumentType[] = [
  "BANK_SCREENSHOT",
  "CHEQUE_PHOTO",
  "UPI_SCREENSHOT",
  "RECEIPT",
  "OTHER",
];

export type UploadPaymentDocResult = { ok: true } | { error: string };

export async function uploadPaymentDocumentAction(
  formData: FormData
): Promise<UploadPaymentDocResult> {
  const profile = await requireProfile();

  const paymentId = String(formData.get("paymentId") || "");
  const typeRaw = String(formData.get("type") || "");
  const notes = String(formData.get("notes") || "").trim().slice(0, 500);
  const file = formData.get("file");

  if (!paymentId) return { error: "Missing payment." };
  if (!VALID_TYPES.includes(typeRaw as PaymentDocumentType)) {
    return { error: "Choose a document type." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > PAYMENT_DOC_MAX_BYTES) {
    return { error: "File must be 10MB or smaller." };
  }
  if (!PAYMENT_DOC_ALLOWED_TYPES[file.type]) {
    return { error: "File must be a PDF or image (PNG / JPG / WebP / HEIC)." };
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { party: { select: { id: true, assignedToId: true } } },
  });
  if (!payment) return { error: "Payment not found." };
  if (!canAccessParty(profile, payment.party)) {
    return { error: "You cannot attach documents to this payment." };
  }

  // Shared 60-uploads-per-hour ceiling with OrderDocument.
  const limitRow = await db.$queryRaw<
    { limited: boolean; retry_after_minutes: number }[]
  >`SELECT * FROM public.check_document_upload_rate_limit(${profile.id}::uuid)`;
  if (limitRow[0]?.limited) {
    return {
      error: `Too many uploads in the last hour. Try again in ${limitRow[0].retry_after_minutes} min.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploaded = await uploadPaymentDocument(paymentId, {
    bytes,
    contentType: file.type,
    fileName: file.name,
  });
  if ("error" in uploaded) return uploaded;

  await db.paymentDocument.create({
    data: {
      paymentId,
      type: typeRaw as PaymentDocumentType,
      storagePath: uploaded.path,
      fileName: file.name.slice(0, 200),
      uploadedById: profile.id,
      notes: notes || null,
    },
  });

  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/payments");
  return { ok: true };
}
