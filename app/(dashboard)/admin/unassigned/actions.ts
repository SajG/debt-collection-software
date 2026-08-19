"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";

export type ActionResult = { ok: true; count: number } | { error: string };

const schema = z.object({
  partyIds: z.array(z.string().min(1)).min(1).max(500),
  assigneeId: z.string().uuid(),
});

// Bulk-assign the given parties to a salesperson. ADMIN only. All-or-
// nothing per call (transaction) so a partial failure doesn't leave
// half the batch reassigned. Uses updateMany so we don't need to
// fetch the rows first.
export async function bulkAssignPartiesAction(input: {
  partyIds: string[];
  assigneeId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const assignee = await db.profile.findUnique({
    where: { id: parsed.data.assigneeId },
    select: { id: true, isActive: true, role: true },
  });
  if (!assignee || !assignee.isActive) {
    return { error: "Assignee must be an active user." };
  }
  if (assignee.role !== "STAFF" && assignee.role !== "ADMIN") {
    return { error: "Assign only to STAFF or ADMIN." };
  }

  const result = await db.party.updateMany({
    where: { id: { in: parsed.data.partyIds }, assignedToId: null },
    data: { assignedToId: parsed.data.assigneeId },
  });

  revalidatePath("/admin/unassigned");
  return { ok: true, count: result.count };
}
