"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import {
  orderSchema,
  orderStatusAdvanceSchema,
  type OrderInput,
  type OrderStatusAdvanceInput,
} from "@/lib/validation";

type ActionResult = { error: string } | never;

/**
 * Next sales order number from the atomic per-year sequence on
 * BusinessSettings (SB/{YY}-{YY+1}/{NNNN}). Same pattern as the
 * proforma/credit-note generators — must run inside the same
 * transaction that creates the order so the sequence and the row
 * either both commit or both roll back.
 *
 * Year here is the Indian fiscal year (Apr–Mar). Orders booked in
 * March 2027 sit in FY 26-27; orders booked on 1 Apr 2027 restart
 * FY 27-28 at 0001.
 */
export async function generateOrderNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const settings = await tx.businessSettings.findFirst({
    select: { id: true, orderSeq: true, orderSeqYear: true },
  });
  if (!settings) throw new Error("Business settings missing");

  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const seq = settings.orderSeqYear === fyStart ? settings.orderSeq + 1 : 1;

  await tx.businessSettings.update({
    where: { id: settings.id },
    data: { orderSeq: seq, orderSeqYear: fyStart },
  });

  const yy = String(fyStart % 100).padStart(2, "0");
  const yyNext = String((fyStart + 1) % 100).padStart(2, "0");
  return `SB/${yy}-${yyNext}/${String(seq).padStart(4, "0")}`;
}

/**
 * Row-visibility rule used by every SalesOrder query.
 * ADMIN and FACTORY see all orders; STAFF sees only their own.
 * Party-scope is applied additionally via canAccessParty on the
 * embedded party, so a STAFF user can't reach an order that
 * references a party they're not assigned to (defence in depth
 * against a hand-crafted URL).
 */
function orderScopeWhere(profile: {
  id: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
}) {
  if (profile.role === "STAFF") return { salespersonId: profile.id };
  return {};
}

export async function createOrderAction(
  input: OrderInput
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role === "FACTORY") {
    return { error: "Factory users cannot create orders." };
  }

  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const data = parsed.data;

  const party = await db.party.findUnique({ where: { id: data.partyId } });
  if (!party || !canAccessParty(profile, party)) {
    return { error: "Party not found." };
  }

  // STAFF can only book orders under their own name; ADMIN can assign to
  // any Profile. If STAFF sent a salespersonId it's ignored.
  const salespersonId =
    profile.role === "ADMIN" && data.salespersonId
      ? data.salespersonId
      : profile.id;

  if (profile.role === "ADMIN" && data.salespersonId) {
    const person = await db.profile.findUnique({
      where: { id: data.salespersonId },
      select: { id: true },
    });
    if (!person) return { error: "Salesperson not found." };
  }

  const product = await db.product.findUnique({
    where: { id: data.productId },
    select: { id: true, brand: true, isActive: true },
  });
  if (!product || !product.isActive) return { error: "Product not found." };

  const orderId = await db.$transaction(async (tx) => {
    const orderNumber = await generateOrderNumber(tx);
    const order = await tx.salesOrder.create({
      data: {
        orderNumber,
        partyId: data.partyId,
        salespersonId,
        productId: data.productId,
        brand: data.brand ?? product.brand,
        quantity: new Prisma.Decimal(data.quantity),
        quantityUnit: data.quantityUnit,
        packingType: data.packingType,
        sizeKg: data.sizeKg,
        productRate: data.productRate,
        paymentTerm: data.paymentTerm,
        transportType: data.transportType,
        expectedDeliveryDate: data.expectedDeliveryDate,
        tokenType: data.tokenType,
        notes: data.notes,
        currentStatus: "ORDER_PLACED",
        statusEvents: {
          create: {
            status: "ORDER_PLACED",
            notes: "Order booked.",
            updatedById: profile.id,
          },
        },
      },
    });
    return order.id;
  });

  revalidatePath("/orders");
  revalidatePath("/production");
  redirect(`/orders/${orderId}`);
}

// Legal status transitions for a sales order. Terminal states
// (DISPATCHED, CANCELLED) have no outgoing edges. LR_GENERATED
// isn't required — floor staff can jump straight to DISPATCHED
// for small deliveries with no lorry receipt.
const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  ORDER_PLACED: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["READY_TO_DISPATCH", "CANCELLED"],
  READY_TO_DISPATCH: ["LR_GENERATED", "DISPATCHED", "CANCELLED"],
  LR_GENERATED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: [],
  CANCELLED: [],
};

export async function advanceOrderStatusAction(
  id: string,
  input: OrderStatusAdvanceInput
): Promise<{ error: string } | { ok: true; status: OrderStatus }> {
  const profile = await requireProfile();

  const parsed = orderStatusAdvanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { status: to, notes } = parsed.data;

  const order = await db.salesOrder.findFirst({
    where: { id, ...orderScopeWhere(profile) },
    include: { party: true },
  });
  if (!order || !canAccessParty(profile, order.party)) {
    return { error: "Order not found." };
  }

  // FACTORY and ADMIN advance any accessible order; STAFF only their own.
  if (profile.role === "STAFF" && order.salespersonId !== profile.id) {
    return { error: "You can only advance your own orders." };
  }

  if (!LEGAL_TRANSITIONS[order.currentStatus].includes(to)) {
    return {
      error: `Cannot move a ${order.currentStatus} order to ${to}.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.orderStatusEvent.create({
      data: {
        salesOrderId: id,
        status: to,
        notes: notes ?? null,
        updatedById: profile.id,
      },
    });
    await tx.salesOrder.update({
      where: { id },
      data: { currentStatus: to },
    });
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  revalidatePath("/production");
  return { ok: true, status: to };
}

export async function linkOrderToInvoiceAction(
  id: string,
  invoiceId: string
): Promise<{ error: string } | { ok: true }> {
  const profile = await requireProfile();

  const order = await db.salesOrder.findFirst({
    where: { id, ...orderScopeWhere(profile) },
    include: { party: true },
  });
  if (!order || !canAccessParty(profile, order.party)) {
    return { error: "Order not found." };
  }
  if (
    order.currentStatus !== "LR_GENERATED" &&
    order.currentStatus !== "DISPATCHED"
  ) {
    return {
      error: "Only LR-generated or dispatched orders can be linked to an invoice.",
    };
  }

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, partyId: true },
  });
  if (!invoice || invoice.partyId !== order.partyId) {
    return { error: "Pick an invoice for the same party." };
  }

  await db.salesOrder.update({
    where: { id },
    data: { linkedInvoiceId: invoiceId },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function unlinkOrderFromInvoiceAction(
  id: string
): Promise<{ error: string } | { ok: true }> {
  const profile = await requireProfile();

  const order = await db.salesOrder.findFirst({
    where: { id, ...orderScopeWhere(profile) },
    include: { party: true },
  });
  if (!order || !canAccessParty(profile, order.party)) {
    return { error: "Order not found." };
  }
  const previous = order.linkedInvoiceId;
  if (!previous) return { ok: true };

  await db.salesOrder.update({
    where: { id },
    data: { linkedInvoiceId: null },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  revalidatePath(`/invoices/${previous}`);
  return { ok: true };
}
