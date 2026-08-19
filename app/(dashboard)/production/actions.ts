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

export async function setExpectedProductionDateAction(
  orderId: string,
  ymd: string | null,
): Promise<ActionResult> {
  await requireFactoryOrAdmin();
  const order = await db.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };

  let date: Date | null = null;
  if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    if (isNaN(parsed.getTime())) return { error: "Invalid date." };
    date = parsed;
  }

  await db.salesOrder.update({
    where: { id: orderId },
    data: { expectedProductionDate: date },
  });

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

// ─────────────────────────────────────────────────────────────────
// Hold: pause an order with a mandatory reason. Any FACTORY or ADMIN
// can call. statusBeforeHold captures the original status so
// releaseOrderHoldAction can restore it. The event insert also fires
// the notify trigger → salesperson gets pushed.
// ─────────────────────────────────────────────────────────────────

const HOLD_CATEGORIES = [
  "RAW_MATERIAL_SHORTAGE",
  "AWAITING_CUSTOMER_CONFIRMATION",
  "PAYMENT_HOLD",
  "OTHER",
] as const;
export type HoldCategory = (typeof HOLD_CATEGORIES)[number];

export async function putOrderOnHoldAction(input: {
  orderId: string;
  category: HoldCategory;
  reason: string;
}): Promise<ActionResult> {
  const profile = await requireFactoryOrAdmin();
  if (!HOLD_CATEGORIES.includes(input.category)) {
    return { error: "Choose a hold reason category." };
  }
  const reason = input.reason?.trim().slice(0, 1000) ?? "";
  if (!reason) return { error: "Hold reason is required." };

  const order = await db.salesOrder.findUnique({ where: { id: input.orderId } });
  if (!order) return { error: "Order not found." };
  if (order.currentStatus === "ON_HOLD") {
    return { error: "Order is already on hold." };
  }
  if (order.currentStatus === "DISPATCHED" || order.currentStatus === "CANCELLED") {
    return { error: `Cannot hold an order that is ${order.currentStatus}.` };
  }

  await db.$transaction([
    db.salesOrder.update({
      where: { id: input.orderId },
      data: {
        currentStatus: "ON_HOLD",
        statusBeforeHold: order.currentStatus,
        holdReasonCategory: input.category,
        holdReason: reason,
      },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: input.orderId,
        status: "ON_HOLD",
        notes: `${input.category}: ${reason}`,
        updatedById: profile.id,
      },
    }),
  ]);

  revalidatePath("/production");
  revalidatePath(`/production/${input.orderId}`);
  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true };
}

export async function releaseOrderHoldAction(input: {
  orderId: string;
  note?: string;
}): Promise<ActionResult> {
  const profile = await requireFactoryOrAdmin();

  const order = await db.salesOrder.findUnique({ where: { id: input.orderId } });
  if (!order) return { error: "Order not found." };
  if (order.currentStatus !== "ON_HOLD") {
    return { error: "Order is not on hold." };
  }
  const restoreTo: OrderStatus = order.statusBeforeHold ?? "ORDER_PLACED";
  const note = input.note?.trim().slice(0, 1000) || `Released to ${restoreTo}`;

  await db.$transaction([
    db.salesOrder.update({
      where: { id: input.orderId },
      data: {
        currentStatus: restoreTo,
        statusBeforeHold: null,
        holdReasonCategory: null,
        holdReason: null,
      },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: input.orderId,
        status: restoreTo,
        notes: note,
        updatedById: profile.id,
      },
    }),
  ]);

  revalidatePath("/production");
  revalidatePath(`/production/${input.orderId}`);
  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Backward status transitions — ADMIN only, always with a reason
// captured on the event. Cannot revert into or out of a hold with
// this action (use put/releaseOrderHold instead) and cannot revert
// to/from PARTIALLY_DISPATCHED (that status is trigger-derived from
// DispatchLots).
// ─────────────────────────────────────────────────────────────────

const REVERTIBLE_STATUSES: OrderStatus[] = [
  "ORDER_PLACED",
  "IN_PRODUCTION",
  "READY_TO_DISPATCH",
  "LR_GENERATED",
];

export async function revertOrderStatusAction(input: {
  orderId: string;
  target: OrderStatus;
  reason: string;
}): Promise<ActionResult> {
  const { requireAdmin } = await import("@/lib/authz");
  const profile = await requireAdmin();
  const reason = input.reason?.trim().slice(0, 1000) ?? "";
  if (!reason) return { error: "A reason is required for a backwards move." };
  if (!REVERTIBLE_STATUSES.includes(input.target)) {
    return { error: "Backward moves are only allowed within the main pipeline." };
  }

  const order = await db.salesOrder.findUnique({ where: { id: input.orderId } });
  if (!order) return { error: "Order not found." };
  if (order.currentStatus === "ON_HOLD") {
    return { error: "Release the hold first, then revert." };
  }
  const currentIdx = REVERTIBLE_STATUSES.indexOf(order.currentStatus as OrderStatus);
  const targetIdx = REVERTIBLE_STATUSES.indexOf(input.target);
  const isBackwards =
    order.currentStatus === "DISPATCHED" ||
    order.currentStatus === "PARTIALLY_DISPATCHED" ||
    (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx);
  if (!isBackwards) {
    return { error: "Target is not earlier than the current status." };
  }

  await db.$transaction([
    db.salesOrder.update({
      where: { id: input.orderId },
      data: { currentStatus: input.target },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: input.orderId,
        status: input.target,
        notes: `ADMIN revert (${order.currentStatus} → ${input.target}): ${reason}`,
        updatedById: profile.id,
      },
    }),
  ]);

  revalidatePath("/production");
  revalidatePath(`/production/${input.orderId}`);
  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// Partial dispatch: append a DispatchLot. The DB trigger
// _on_dispatch_lot_change() recomputes currentStatus to
// PARTIALLY_DISPATCHED (sum < ordered) or DISPATCHED (sum >= ordered)
// and writes the corresponding OrderStatusEvent. That event's insert
// fires the notify trigger, so the salesperson gets pinged.
// ─────────────────────────────────────────────────────────────────

export async function addDispatchLotAction(input: {
  orderId: string;
  quantity: number;
  lrNumber?: string;
  notes?: string;
  dispatchedAt?: Date | string | null;
}): Promise<ActionResult> {
  const profile = await requireFactoryOrAdmin();
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { error: "Quantity must be a positive number." };
  }
  const order = await db.salesOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, quantity: true, currentStatus: true },
  });
  if (!order) return { error: "Order not found." };
  if (order.currentStatus === "CANCELLED") {
    return { error: "Cannot dispatch a cancelled order." };
  }

  await db.dispatchLot.create({
    data: {
      salesOrderId: input.orderId,
      quantity: qty,
      lrNumber: input.lrNumber?.trim() || null,
      notes: input.notes?.trim() || null,
      dispatchedAt: input.dispatchedAt ? new Date(input.dispatchedAt) : new Date(),
      createdById: profile.id,
    },
  });

  revalidatePath("/production");
  revalidatePath(`/production/${input.orderId}`);
  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// OrderComment — append-only. Any role that can access the order
// per RLS can post. Server-side we also double-check for STAFF so
// the client can't post to somebody else's order even if RLS were
// misconfigured.
// ─────────────────────────────────────────────────────────────────

export async function addOrderCommentAction(input: {
  orderId: string;
  body: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  const body = input.body?.trim() ?? "";
  if (!body) return { error: "Say something before sending." };
  if (body.length > 4000) return { error: "Comment is too long (4000 char max)." };

  const order = await db.salesOrder.findUnique({
    where: { id: input.orderId },
    select: { id: true, salespersonId: true },
  });
  if (!order) return { error: "Order not found." };

  if (profile.role === "STAFF" && order.salespersonId !== profile.id) {
    return { error: "You can only comment on your own orders." };
  }

  await db.orderComment.create({
    data: {
      salesOrderId: order.id,
      authorId: profile.id,
      body,
    },
  });

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/production/${order.id}`);
  return { ok: true };
}
