"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { getDefaultOrgId } from "@/lib/tenancy";
import { recoveryTargetSchema, type RecoveryTargetInput } from "@/lib/validation";

type ActionResult = { error: string } | { ok: true };

export async function upsertRecoveryTarget(
  input: RecoveryTargetInput
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = recoveryTargetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { userId, month, targetAmount } = parsed.data;

  const [y, m] = month.split("-").map(Number);
  const monthKey = new Date(Date.UTC(y, m - 1, 1));

  const organizationId = await getDefaultOrgId();
  await db.recoveryTarget.upsert({
    where: {
      organizationId_userId_month: { organizationId, userId, month: monthKey },
    },
    create: { organizationId, userId, month: monthKey, targetAmount },
    update: { targetAmount },
  });

  revalidatePath("/targets");
  return { ok: true };
}
