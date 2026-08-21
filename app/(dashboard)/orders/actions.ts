"use server";

import { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

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
    dispatchLocation: z.string().trim().max(500).optional(),
    tokenType: z.string().trim().max(120).optional(),
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

// Map raw RPC exception text → the strings the UI already knows how
// to render. Keeps app/(dashboard)/orders/new/order-form.tsx
// completely unchanged. Order matters — most specific first.
function mapRpcError(raw: string): {
  error: string;
  fieldErrors?: Record<string, string>;
} {
  if (/credit limit would be exceeded/i.test(raw)) {
    return {
      error:
        "Credit limit would be exceeded. Ask an admin to review, or collect outstanding first.",
      fieldErrors: { creditOverride: "blocked" },
    };
  }
  if (/override note required/i.test(raw)) {
    return {
      error:
        "Enter an override note to place this order past the credit limit.",
      fieldErrors: {
        creditOverrideNote: "Required to override credit limit.",
      },
    };
  }
  if (/customer is assigned to another salesperson/i.test(raw)) {
    return { error: "This customer is assigned to another salesperson." };
  }
  if (/selected product is unavailable/i.test(raw)) {
    return { error: "Selected product is unavailable." };
  }
  if (/customer not found/i.test(raw)) {
    return { error: "Customer not found." };
  }
  if (/too many orders/i.test(raw)) {
    return {
      error: "Too many orders in the last hour. Try again shortly.",
    };
  }
  if (/account disabled/i.test(raw)) {
    return { error: "Your account is disabled." };
  }
  return { error: "Could not save order — please try again." };
}

export async function createSalesOrderAction(
  formData: FormData,
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

  // Single write path — the create_sales_order RPC. Enforces:
  //   role gate (STAFF/ADMIN, active)
  //   party ownership (STAFF only)
  //   product availability + custom-product stub
  //   rate limit (check_order_create_rate_limit)
  //   floor-rate → needsRateApproval
  //   credit-limit gate + admin override with note
  //   order-number advisory lock
  //   seed OrderStatusEvent with credit / rate context
  //
  // The web action's job here is Zod validation, RPC call, error-
  // message mapping into the shape the client form expects.
  const supabase = createClient();
  const rpcPayload = {
    p_party_id: data.customerMode === "existing" ? data.partyId! : null,
    p_new_customer_name:
      data.customerMode === "new" ? data.newCustomerName! : null,
    p_dispatch_location: data.dispatchLocation ?? null,
    p_product_id: data.productId,
    p_new_product_name: null,
    p_brand: null, // RPC falls back to product.brand
    p_quantity: data.quantity,
    p_quantity_unit: data.quantityUnit,
    p_packing_type: data.packingType ?? "",
    p_size_kg: data.sizeKg ?? "",
    p_product_rate: data.productRate,
    p_payment_term: data.paymentTerm ?? "",
    p_transport_type: data.transportType ?? "",
    p_expected_delivery_date: data.expectedDeliveryDate || null,
    p_token_type: data.tokenType ?? null,
    p_notes: data.notes ?? null,
    p_credit_override_note: data.creditOverrideNote ?? null,
  };

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "create_sales_order",
    rpcPayload,
  );
  if (rpcErr) {
    return mapRpcError(rpcErr.message ?? "");
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row || typeof row.id !== "string") {
    return { error: "Could not save order — please try again." };
  }

  revalidatePath("/orders");
  revalidatePath("/production");
  return {
    ok: true,
    id: row.id,
    orderNumber: (row.orderNumber ?? row.order_number) as string,
  };
}

export async function cancelSalesOrderAction(
  orderId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  const profile = await requireProfile();
  const order = await db.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Order not found." };
  const isOwner = order.salespersonId === profile.id;
  if (profile.role !== "ADMIN" && !isOwner) {
    return { error: "You cannot cancel this order." };
  }
  if (
    order.currentStatus === "DISPATCHED" ||
    order.currentStatus === "DELIVERED" ||
    order.currentStatus === "CANCELLED" ||
    order.currentStatus === "REJECTED"
  ) {
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
