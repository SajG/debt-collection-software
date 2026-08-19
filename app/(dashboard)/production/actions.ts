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

  // F7 — Fire the WhatsApp dispatch confirmation on the DISPATCHED
  // edge. Best-effort; a WhatsApp failure never blocks the status
  // transition. Uses its own module (lib/messaging/dispatch-
  // confirmation.ts) — NOT the receivables-follow-up pipeline.
  if (next === "DISPATCHED") {
    try {
      const { sendDispatchConfirmation } = await import(
        "@/lib/messaging/dispatch-confirmation"
      );
      // Fire-and-forget: awaited so DB errors surface in server logs,
      // but the result isn't returned to the caller.
      await sendDispatchConfirmation(orderId);
    } catch (e) {
      // Never blocks status advance; logged inside the module.
      console.warn("dispatch-confirmation failed", e);
    }
  }

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

  // Rate-limit — 60 doc uploads / user / hour (order + payment
  // buckets share the counter). Refuses cleanly before we allocate
  // memory for the buffer or hit storage.
  const limitRow = await db.$queryRaw<
    { limited: boolean; retry_after_minutes: number }[]
  >`SELECT * FROM public.check_document_upload_rate_limit(${profile.id}::uuid)`;
  if (limitRow[0]?.limited) {
    return {
      error: `Too many uploads in the last hour. Try again in ${limitRow[0].retry_after_minutes} min.`,
    };
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

// ─────────────────────────────────────────────────────────────────
// Order-attached invoice recording. Reuses the existing Invoice model
// (partyId + invoiceNumber); the link back to the order is via
// SalesOrder.linkedInvoiceId. No parallel model.
//
// Allowed for ADMIN and FACTORY. Refuses if the order has no party
// (still a free-text newCustomerName — promote via /admin/new-
// customer-names first). Refuses if an invoice with the same number
// already exists for the party.
// ─────────────────────────────────────────────────────────────────

const orderInvoiceSchema = (() => {
  const z = require("zod") as typeof import("zod");
  return z.object({
    orderId: z.string().min(1),
    invoiceNumber: z.string().trim().min(1).max(50),
    invoiceDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    totalAmount: z.coerce.number().positive().max(10_000_000_000),
    notes: z.string().trim().max(1000).optional(),
  });
})();

export async function recordOrderInvoiceAction(input: {
  orderId: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate: Date | string;
  totalAmount: number | string;
  notes?: string;
}): Promise<ActionResult> {
  const profile = await requireFactoryOrAdmin();

  const parsed = orderInvoiceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  const order = await db.salesOrder.findUnique({
    where: { id: d.orderId },
    select: {
      id: true,
      partyId: true,
      linkedInvoiceId: true,
      currentStatus: true,
    },
  });
  if (!order) return { error: "Order not found." };
  if (!order.partyId) {
    return {
      error:
        "This order still uses a free-text customer name. Promote it to a real customer first (Admin → New-customer names).",
    };
  }
  if (order.linkedInvoiceId) {
    return { error: "This order already has an invoice attached." };
  }
  // Blocks recording an invoice against a cancelled order — the invoice
  // wouldn't be paid anyway. IN_PRODUCTION and earlier are allowed
  // because invoicing before dispatch is common in this trade.
  if (order.currentStatus === "CANCELLED") {
    return { error: "Cannot record an invoice against a cancelled order." };
  }

  const dupe = await db.invoice.findUnique({
    where: {
      partyId_invoiceNumber: {
        partyId: order.partyId,
        invoiceNumber: d.invoiceNumber,
      },
    },
    select: { id: true },
  });
  if (dupe) {
    return {
      error: `Invoice ${d.invoiceNumber} already exists for this customer.`,
    };
  }

  const { deriveInvoiceStatus } = await import("@/lib/ar/balance");
  const { Prisma } = await import("@prisma/client");
  const total = new Prisma.Decimal(d.totalAmount);

  await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        partyId: order.partyId!,
        invoiceNumber: d.invoiceNumber,
        invoiceDate: d.invoiceDate,
        dueDate: d.dueDate,
        totalAmount: total,
        notes: d.notes ?? null,
        source: "MANUAL",
        status: deriveInvoiceStatus(total, new Prisma.Decimal(0), d.dueDate),
      },
    });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: { linkedInvoiceId: invoice.id },
    });
    // Recompute party outstanding — the trigger fires on Invoice
    // UPDATE-of-columns; INSERT already lands via its own trigger,
    // but doing this here keeps the sequence explicit.
  });

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/production/${order.id}`);
  revalidatePath("/parties");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// F1 — Order editing before production starts.
// Quantity, rate, delivery date. Every accepted change writes a row
// on OrderStatusEvent with the current status unchanged and notes of
// the form "[EDIT] <field>: <old>→<new>" so the timeline shows the
// history without a parallel audit table.
//
// STAFF may edit only while the order is ORDER_PLACED, and only their
// own order. ADMIN may edit at any status but must provide a reason.
// FACTORY cannot edit — they change status, not order contents.
// ─────────────────────────────────────────────────────────────────

type OrderEdit = {
  orderId: string;
  quantity?: number | string;
  productRate?: string;
  expectedDeliveryDate?: string | Date | null;
  reason?: string;
};

const EDITABLE_KEYS = ["quantity", "productRate", "expectedDeliveryDate"] as const;

async function applyOrderEdit(
  actorId: string,
  input: OrderEdit,
  allowAfterProduction: boolean,
): Promise<ActionResult> {
  const order = await db.salesOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      currentStatus: true,
      salespersonId: true,
      quantity: true,
      productRate: true,
      expectedDeliveryDate: true,
      orderValue: true,
    },
  });
  if (!order) return { error: "Order not found." };

  const canEdit =
    allowAfterProduction || order.currentStatus === "ORDER_PLACED";
  if (!canEdit) {
    return {
      error:
        "Production has started. Only an admin can edit this order, and a reason is required.",
    };
  }

  const changes: string[] = [];
  const patch: Record<string, unknown> = {};

  if (input.quantity !== undefined && input.quantity !== "") {
    const nextQty =
      typeof input.quantity === "number" ? input.quantity : Number(input.quantity);
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      return { error: "Quantity must be a positive number." };
    }
    const prev = Number(order.quantity);
    if (prev !== nextQty) {
      changes.push(`quantity: ${prev}→${nextQty}`);
      patch.quantity = nextQty;
      // Recompute orderValue when qty changes.
      const rateStr = (input.productRate ?? order.productRate) as string;
      const parsedRate = Number(rateStr.replace(/[₹,\s]/g, "").match(/-?[\d.]+/)?.[0] ?? 0);
      if (Number.isFinite(parsedRate)) {
        patch.orderValue = Number((nextQty * parsedRate).toFixed(2));
      }
    }
  }

  if (input.productRate !== undefined) {
    const nextRate = input.productRate.trim();
    if (nextRate !== order.productRate) {
      changes.push(`rate: ${order.productRate}→${nextRate}`);
      patch.productRate = nextRate;
      const qtyForValue = (patch.quantity as number | undefined) ?? Number(order.quantity);
      const parsedRate = Number(nextRate.replace(/[₹,\s]/g, "").match(/-?[\d.]+/)?.[0] ?? 0);
      if (Number.isFinite(parsedRate)) {
        patch.orderValue = Number((qtyForValue * parsedRate).toFixed(2));
      }
    }
  }

  if (input.expectedDeliveryDate !== undefined) {
    const nextDate = input.expectedDeliveryDate
      ? new Date(input.expectedDeliveryDate)
      : null;
    const prevDate = order.expectedDeliveryDate;
    const prevIso = prevDate ? prevDate.toISOString().slice(0, 10) : "null";
    const nextIso = nextDate ? nextDate.toISOString().slice(0, 10) : "null";
    if (prevIso !== nextIso) {
      if (nextDate && isNaN(nextDate.getTime())) {
        return { error: "Invalid delivery date." };
      }
      changes.push(`delivery: ${prevIso}→${nextIso}`);
      patch.expectedDeliveryDate = nextDate;
    }
  }

  if (changes.length === 0) return { error: "Nothing to change." };

  const reason = allowAfterProduction ? (input.reason ?? "").trim() : "";
  if (allowAfterProduction && order.currentStatus !== "ORDER_PLACED" && !reason) {
    return { error: "Reason is required for edits after production starts." };
  }

  const noteBody = [
    "[EDIT]",
    ...changes,
    reason ? `— ${reason}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);

  await db.$transaction([
    db.salesOrder.update({ where: { id: order.id }, data: patch }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: order.id,
        status: order.currentStatus,
        notes: noteBody,
        updatedById: actorId,
      },
    }),
  ]);

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/production/${order.id}`);
  return { ok: true };
}

export async function editOrderBeforeProductionAction(
  input: OrderEdit,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const order = await db.salesOrder.findUnique({
    where: { id: input.orderId },
    select: { salespersonId: true },
  });
  if (!order) return { error: "Order not found." };
  if (profile.role === "STAFF" && order.salespersonId !== profile.id) {
    return { error: "You can only edit your own orders." };
  }
  if (profile.role !== "STAFF" && profile.role !== "ADMIN") {
    return { error: "Only STAFF or ADMIN may edit orders." };
  }
  return applyOrderEdit(profile.id, input, /* allowAfterProduction */ false);
}

export async function adminEditOrderAction(
  input: OrderEdit,
): Promise<ActionResult> {
  const { requireAdmin } = await import("@/lib/authz");
  const admin = await requireAdmin();
  return applyOrderEdit(admin.id, input, /* allowAfterProduction */ true);
}

// ─────────────────────────────────────────────────────────────────
// F3 — Delivery confirmation. Salesperson (or customer via signed
// link — ships in Batch 2) marks the order DELIVERED. Stamps
// deliveredAt for the analytics dashboard.
// ─────────────────────────────────────────────────────────────────

export async function confirmOrderDeliveryAction(input: {
  orderId: string;
  note?: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  const order = await db.salesOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      currentStatus: true,
      salespersonId: true,
      deliveredAt: true,
    },
  });
  if (!order) return { error: "Order not found." };
  if (order.currentStatus !== "DISPATCHED") {
    return {
      error: `Only dispatched orders can be marked delivered (current: ${order.currentStatus}).`,
    };
  }
  if (profile.role === "STAFF" && order.salespersonId !== profile.id) {
    return { error: "You can only confirm your own orders." };
  }
  if (order.deliveredAt) {
    return { error: "Order was already marked delivered." };
  }

  const now = new Date();
  await db.$transaction([
    db.salesOrder.update({
      where: { id: order.id },
      data: { currentStatus: "DELIVERED", deliveredAt: now },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: order.id,
        status: "DELIVERED",
        notes: input.note?.trim().slice(0, 1000) || "Delivery confirmed",
        updatedById: profile.id,
      },
    }),
  ]);

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/production/${order.id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────
// F6 — Rate approval. Mirrors the credit-override pattern:
//   creditCheckPassed / creditOverrideById / creditOverrideNote
// becomes
//   needsRateApproval / rateApprovedById / rateApprovedAt / rateApprovalNote
//
// Only ADMIN can approve. Factory should filter out
// needsRateApproval=true orders from its queue (see production page
// query). The approval writes an OrderStatusEvent so the timeline
// shows who cleared it and why.
// ─────────────────────────────────────────────────────────────────

export async function approveOrderRateAction(input: {
  orderId: string;
  note?: string;
}): Promise<ActionResult> {
  const { requireAdmin } = await import("@/lib/authz");
  const admin = await requireAdmin();

  const order = await db.salesOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      needsRateApproval: true,
      currentStatus: true,
    },
  });
  if (!order) return { error: "Order not found." };
  if (!order.needsRateApproval) {
    return { error: "This order does not need rate approval." };
  }
  const note = input.note?.trim().slice(0, 1000) || "Rate approved";

  await db.$transaction([
    db.salesOrder.update({
      where: { id: order.id },
      data: {
        needsRateApproval: false,
        rateApprovedById: admin.id,
        rateApprovedAt: new Date(),
        rateApprovalNote: note,
      },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: order.id,
        status: order.currentStatus,
        notes: `[RATE APPROVED] ${note}`,
        updatedById: admin.id,
      },
    }),
  ]);

  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/production/${order.id}`);
  revalidatePath("/admin/rate-approvals");
  return { ok: true };
}
