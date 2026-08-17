"use server";

import { Prisma, OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { nextOrderNumber, previewCredit } from "@/lib/orders/create";

export type CreateOrderResult =
  | { ok: true; id: string; orderNumber: string }
  | { error: string; fieldErrors?: Record<string, string> };

const QUANTITY_UNITS = ["PCS", "KG", "NOS"] as const;

const createSchema = z
  .object({
    customerMode: z.enum(["existing", "new"]),
    partyId: z.string().trim().optional(),
    newCustomerName: z.string().trim().max(200).optional(),
    newCustomerPhone: z
      .string()
      .trim()
      .max(15)
      .optional()
      .transform((v) => (v ? v.replace(/\D/g, "").slice(-10) : "")),
    productId: z.string().trim().min(1, "Choose a product."),
    quantity: z
      .string()
      .trim()
      .min(1, "Enter a quantity.")
      .transform((v) => Number(v.replace(/,/g, "")))
      .refine((n) => Number.isFinite(n) && n > 0, "Quantity must be positive."),
    quantityUnit: z.enum(QUANTITY_UNITS),
    packingType: z.string().trim().max(80).optional(),
    sizeKg: z.string().trim().max(20).optional(),
    productRate: z.string().trim().min(1, "Enter a rate.").max(40),
    paymentTerm: z.string().trim().max(80).optional(),
    transportType: z.string().trim().max(80).optional(),
    expectedDeliveryDate: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
    creditOverrideNote: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.customerMode === "existing" && !v.partyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["partyId"],
        message: "Choose a customer from your ledger.",
      });
    }
    if (v.customerMode === "new" && !v.newCustomerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newCustomerName"],
        message: "Enter the new customer's name.",
      });
    }
  });

function parseDeliveryDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** Best-effort — takes "185", "42.50", "185 / pc". */
function parseRate(raw: string): number {
  const m = raw.replace(/[₹,\s]/g, "").match(/-?[\d.]+/);
  return m ? Number(m[0]) : 0;
}

export async function createSalesOrderAction(
  formData: FormData
): Promise<CreateOrderResult> {
  const profile = await requireProfile();
  if (profile.role === "FACTORY") {
    return { error: "Factory users cannot place orders." };
  }

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    const fieldErrors: Record<string, string> = {};
    for (const e of parsed.error.errors) {
      const key = e.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = e.message;
    }
    return { error: first.message, fieldErrors };
  }
  const data = parsed.data;

  const product = await db.product.findUnique({
    where: { id: data.productId },
  });
  if (!product || !product.isActive) {
    return { error: "Selected product is unavailable." };
  }

  // Resolve customer + credit gate
  let partyId: string | null = null;
  let newCustomerName: string | null = null;
  let creditCheckPassed = true;
  let creditOverrideById: string | null = null;

  const rate = parseRate(data.productRate);
  const orderValue = Number((data.quantity * rate).toFixed(2));

  if (data.customerMode === "existing") {
    const party = await db.party.findUnique({ where: { id: data.partyId! } });
    if (!party) return { error: "Customer not found." };
    if (
      profile.role === "STAFF" &&
      party.assignedToId &&
      party.assignedToId !== profile.id
    ) {
      return { error: "This customer is assigned to another salesperson." };
    }
    partyId = party.id;

    const credit = previewCredit(party, orderValue);
    if (credit.wouldExceed) {
      // Only ADMIN can override, and must supply a note.
      if (profile.role !== "ADMIN") {
        return {
          error:
            "Credit limit would be exceeded. Ask an admin to review, or collect outstanding first.",
          fieldErrors: { creditOverride: "blocked" },
        };
      }
      if (!data.creditOverrideNote) {
        return {
          error: "Enter an override note to place this order past the credit limit.",
          fieldErrors: { creditOverrideNote: "Required to override credit limit." },
        };
      }
      creditCheckPassed = false;
      creditOverrideById = profile.id;
    }
  } else {
    newCustomerName = data.newCustomerName!;
  }

  const expectedDate = parseDeliveryDate(data.expectedDeliveryDate);

  try {
    const created = await db.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx);
      return tx.salesOrder.create({
        data: {
          orderNumber,
          partyId,
          newCustomerName,
          salespersonId: profile.id,
          productId: product.id,
          brand: product.brand,
          quantity: new Prisma.Decimal(data.quantity),
          quantityUnit: data.quantityUnit,
          packingType: data.packingType || null,
          sizeKg: data.sizeKg || null,
          productRate: data.productRate,
          orderValue: new Prisma.Decimal(orderValue),
          paymentTerm: data.paymentTerm || null,
          transportType: data.transportType || null,
          expectedDeliveryDate: expectedDate,
          notes: data.notes || null,
          currentStatus: OrderStatus.ORDER_PLACED,
          creditCheckPassed,
          creditOverrideById,
          creditOverrideNote: creditOverrideById ? data.creditOverrideNote! : null,
          statusEvents: {
            create: {
              status: OrderStatus.ORDER_PLACED,
              notes: creditOverrideById
                ? `Order placed with credit override: ${data.creditOverrideNote}`
                : "Order placed",
              updatedById: profile.id,
            },
          },
        },
      });
    });

    revalidatePath("/orders");
    revalidatePath("/production");
    return { ok: true, id: created.id, orderNumber: created.orderNumber };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // Retry once — unique orderNumber collision under concurrent creates.
      try {
        const retry = await db.$transaction(async (tx) => {
          const orderNumber = await nextOrderNumber(tx);
          return tx.salesOrder.create({
            data: {
              orderNumber,
              partyId,
              newCustomerName,
              salespersonId: profile.id,
              productId: product.id,
              brand: product.brand,
              quantity: new Prisma.Decimal(data.quantity),
              quantityUnit: data.quantityUnit,
              packingType: data.packingType || null,
              sizeKg: data.sizeKg || null,
              productRate: data.productRate,
              orderValue: new Prisma.Decimal(orderValue),
              paymentTerm: data.paymentTerm || null,
              transportType: data.transportType || null,
              expectedDeliveryDate: expectedDate,
              notes: data.notes || null,
              currentStatus: OrderStatus.ORDER_PLACED,
              creditCheckPassed,
              creditOverrideById,
              creditOverrideNote: creditOverrideById
                ? data.creditOverrideNote!
                : null,
              statusEvents: {
                create: {
                  status: OrderStatus.ORDER_PLACED,
                  updatedById: profile.id,
                },
              },
            },
          });
        });
        revalidatePath("/orders");
        revalidatePath("/production");
        return { ok: true, id: retry.id, orderNumber: retry.orderNumber };
      } catch {
        return { error: "Could not save order — please try again." };
      }
    }
    return { error: "Could not save order — please try again." };
  }
}

export async function cancelSalesOrderAction(
  orderId: string,
  reason: string
): Promise<{ ok: true } | { error: string }> {
  const profile = await requireProfile();
  const order = await db.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };
  const isOwner = order.salespersonId === profile.id;
  if (profile.role !== "ADMIN" && !isOwner) {
    return { error: "You cannot cancel this order." };
  }
  if (order.currentStatus === "DISPATCHED" || order.currentStatus === "CANCELLED") {
    return { error: "This order can no longer be cancelled." };
  }
  const note = reason.trim().slice(0, 500) || "Cancelled";

  await db.$transaction([
    db.salesOrder.update({
      where: { id: orderId },
      data: { currentStatus: OrderStatus.CANCELLED },
    }),
    db.orderStatusEvent.create({
      data: {
        salesOrderId: orderId,
        status: OrderStatus.CANCELLED,
        notes: note,
        updatedById: profile.id,
      },
    }),
  ]);

  revalidatePath("/orders");
  revalidatePath("/production");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/production/${orderId}`);
  return { ok: true };
}

/** Client helper used by the order form to redirect after success. */
export async function redirectToOrder(id: string): Promise<never> {
  redirect(`/orders/${id}`);
}
