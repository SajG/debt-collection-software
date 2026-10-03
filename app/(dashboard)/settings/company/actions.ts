"use server";

import { revalidatePath } from "next/cache";
import { requireMembership, tenantDb } from "@/lib/tenant";
import { captureError } from "@/lib/monitoring";
import { cancelCompanyDeletion, requestCompanyDeletion } from "@/lib/platform/company-deletion";
import { sendEmail } from "@/lib/email/send";
import { companyDeletionScheduledEmail } from "@/lib/email/templates";

// SY35 — owner-only company deletion. Middleware lets POSTs to
// /settings/company through while the company is read-only, so an owner
// can always cancel a scheduled deletion.

export type CompanyActionResult = { ok: true; message: string } | { error: string };

async function requireOwner() {
  const ctx = await requireMembership();
  if (!ctx.isOwner) throw new Error("Only the company owner can do this.");
  return ctx;
}

export async function deleteCompanyAction(input: { confirmName: string }): Promise<CompanyActionResult> {
  try {
    const ctx = await requireOwner();
    const db = tenantDb(ctx.organizationId);
    const org = await db.organization.findFirstOrThrow({ select: { name: true } });
    if (input.confirmName.trim() !== org.name.trim()) {
      return { error: "Type the company name exactly as shown to confirm." };
    }
    const { scheduledFor } = await requestCompanyDeletion(ctx.organizationId, ctx.profile.id);
    if (ctx.profile.email) {
      await sendEmail({
        to: ctx.profile.email,
        ...companyDeletionScheduledEmail({
          ownerName: ctx.profile.ownerName,
          companyName: org.name,
          scheduledFor,
        }),
      });
    }
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Scheduled. ${org.name} is read-only now and will be deleted on ${scheduledFor.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
    };
  } catch (e) {
    void captureError(e, { scope: "settings.company.delete" });
    return { error: e instanceof Error ? e.message : "Could not schedule the deletion." };
  }
}

export async function cancelCompanyDeletionAction(): Promise<CompanyActionResult> {
  try {
    const ctx = await requireOwner();
    await cancelCompanyDeletion(ctx.organizationId);
    revalidatePath("/", "layout");
    return { ok: true, message: "Deletion cancelled. Your company is back to normal." };
  } catch (e) {
    void captureError(e, { scope: "settings.company.cancel-delete" });
    return { error: e instanceof Error ? e.message : "Could not cancel the deletion." };
  }
}
