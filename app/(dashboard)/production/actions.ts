"use server";

import type { DocumentType, OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile, requireFactoryOrAdmin } from "@/lib/authz";
import { nextOrderStatus } from "@/lib/orders/status";
import {
  uploadOrderDocument,
  ORDER_DOC_MAX_BYTES,
  ORDER_DOC_ALLOWED_TYPES,
} from "@/lib/storage";

// Document upload permission model:
//   FACTORY / ADMIN  → any type (invoice, LR, order proof, other)
//   STAFF            → only their own orders, and only ORDER_PROOF / OTHER
//                      (invoice + LR are factory-authoritative documents).
const STAFF_ALLOWED_TYPES: DocumentType[] = ["ORDER_PROOF", "OTHER"];

export type ActionResult = { ok: true } | { error: string };

export async function advanceOrderStatusAction(
  orderId: string,
  expectedNext: OrderStatus,
  notes?: string
): Promise<ActionResult> {
  const profile = await requireFactoryOrAdmin();

  const order = await db.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };

  const next = nextOrderStatus(order.currentStatus);
  if (!next) {
    return { error: "This order cannot be advanced further." };
  }
  if (next !== expectedNext) {
    return {
      error: `Status changed elsewhere — refresh and try again (expected ${expectedNext}).`,
    };
  }

  const note = notes?.trim() ? notes.trim().slice(0, 1000) : null;

  // Append-only audit: update currentStatus + insert a new event. Never mutate
  // or delete prior OrderStatusEvent rows.
  await db.$transaction([
    db.salesOrder.update({
      where: { id: orderId },
      data: { currentStatus: next },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: orderId,
        status: next,
        notes: note,
        updatedById: profile.id,
      },
    }),
  ]);

  revalidatePath("/production");
  revalidatePath(`/production/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function uploadOrderDocumentAction(
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();

  const orderId = String(formData.get("orderId") || "");
  const typeRaw = String(formData.get("type") || "");
  const file = formData.get("file");

  if (!orderId) return { error: "Missing order." };
  if (!["INVOICE", "LORRY_RECEIPT", "ORDER_PROOF", "OTHER"].includes(typeRaw)) {
    return { error: "Choose a document type." };
  }
  const type = typeRaw as DocumentType;
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > ORDER_DOC_MAX_BYTES) {
    return { error: "File must be 10MB or smaller." };
  }
  if (!ORDER_DOC_ALLOWED_TYPES[file.type]) {
    return { error: "File must be a PDF, PNG, JPG, or WebP." };
  }

  const order = await db.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };

  // Access + type gates by role
  if (profile.role === "STAFF") {
    if (order.salespersonId !== profile.id) {
      return { error: "You can only attach documents to your own orders." };
    }
    if (!STAFF_ALLOWED_TYPES.includes(type)) {
      return {
        error: "Only Order proof / Other can be uploaded by salespeople — invoice and LR come from the factory.",
      };
    }
  } else if (profile.role !== "FACTORY" && profile.role !== "ADMIN") {
    return { error: "You cannot upload documents." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploaded = await uploadOrderDocument(orderId, {
    bytes,
    contentType: file.type,
    fileName: file.name,
  });
  if ("error" in uploaded) return uploaded;

  // Append-only — one new OrderDocument row per upload; never overwrite.
  await db.orderDocument.create({
    data: {
      salesOrderId: orderId,
      type,
      storagePath: uploaded.path,
      uploadedById: profile.id,
    },
  });

  revalidatePath(`/production/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
