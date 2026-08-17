"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";

const upsertSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  brand: z.string().trim().max(80).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional().default(0),
  isActive: z.union([z.literal("on"), z.literal(""), z.undefined()])
    .transform((v) => v === "on"),
});

export type UpsertResult = { ok: true } | { error: string; fieldErrors?: Record<string, string> };

async function requireAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") throw new Error("Admin only");
  return profile;
}

export async function upsertProductAction(fd: FormData): Promise<UpsertResult> {
  await requireAdmin();
  const raw = Object.fromEntries(fd) as Record<string, string>;
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const e of parsed.error.errors) {
      const key = e.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = e.message;
    }
    return { error: parsed.error.errors[0].message, fieldErrors };
  }
  const data = parsed.data;
  const payload = {
    name: data.name,
    brand: data.brand ?? "",
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive,
  };
  if (data.id) {
    await db.product.update({ where: { id: data.id }, data: payload });
  } else {
    await db.product.create({ data: payload });
  }
  revalidatePath("/admin/products");
  return { ok: true };
}

export async function toggleProductActiveAction(id: string): Promise<UpsertResult> {
  await requireAdmin();
  const p = await db.product.findUnique({ where: { id } });
  if (!p) return { error: "Not found" };
  await db.product.update({ where: { id }, data: { isActive: !p.isActive } });
  revalidatePath("/admin/products");
  return { ok: true };
}
