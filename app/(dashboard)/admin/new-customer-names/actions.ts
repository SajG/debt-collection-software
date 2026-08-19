"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";

export type ActionResult =
  | { ok: true; partyId: string; ordersUpdated: number }
  | { error: string };

const schema = z.object({
  // The exact string that appeared in SalesOrder.newCustomerName. Used
  // to back-fill every order carrying that same free-text name.
  fromName: z.string().trim().min(1).max(120),
  // The real Party fields. Everything except name is optional so a
  // director can promote on the spot with just a name; details come
  // later on the customer page.
  name: z.string().trim().min(2, "Enter the party name").max(120),
  phone: z.string().trim().max(15).optional(),
  city: z.string().trim().max(100).optional(),
  assignedToId: z.string().uuid().optional(),
});

// Promote every SalesOrder carrying `fromName` in newCustomerName to a
// real Party. Idempotent-ish: if a Party with the same case-insensitive
// name already exists, reuse it rather than creating a duplicate.
export async function promoteNewCustomerNameAction(input: {
  fromName: string;
  name: string;
  phone?: string;
  city?: string;
  assignedToId?: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;

  // Reuse an existing Party if the target name already matches — the
  // convert flow shouldn't spawn duplicates when the same customer was
  // added manually elsewhere.
  const existing = await db.party.findFirst({
    where: { name: { equals: d.name, mode: "insensitive" } },
    select: { id: true, assignedToId: true },
  });

  let partyId: string;
  if (existing) {
    partyId = existing.id;
    // Only overwrite an unassigned owner — never move a customer away
    // from an existing assignee silently.
    if (d.assignedToId && !existing.assignedToId) {
      await db.party.update({
        where: { id: existing.id },
        data: { assignedToId: d.assignedToId },
      });
    }
  } else {
    const created = await db.party.create({
      data: {
        name: d.name,
        phone: d.phone ? d.phone.replace(/\D/g, "").slice(-10) : null,
        city: d.city,
        assignedToId: d.assignedToId ?? admin.id,
      },
    });
    partyId = created.id;
  }

  // Back-fill every order that referred to this free-text name.
  const updated = await db.salesOrder.updateMany({
    where: { newCustomerName: d.fromName, partyId: null },
    data: { partyId, newCustomerName: null },
  });

  revalidatePath("/admin/new-customer-names");
  revalidatePath("/orders");
  return { ok: true, partyId, ordersUpdated: updated.count };
}
