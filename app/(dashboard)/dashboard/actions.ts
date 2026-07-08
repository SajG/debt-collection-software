"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { refreshOverdueStatuses } from "@/lib/ar/balance";

/**
 * On-demand overdue-status recompute. The daily cron pass
 * (/api/cron/reminders) owns this normally; this button covers "an
 * invoice went overdue since 5am and I want the dashboard exact now".
 * Kept out of the render path so page loads never wait on writes.
 */
export async function refreshStatusesAction(): Promise<{ updated: number }> {
  await requireProfile();
  const updated = await db.$transaction((tx) => refreshOverdueStatuses(tx));
  revalidatePath("/dashboard");
  revalidatePath("/worklist");
  revalidatePath("/invoices");
  return { updated };
}
