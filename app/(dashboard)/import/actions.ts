"use server";

import { revalidatePath } from "next/cache";
import type { AccountingProvider } from "@prisma/client";
import { requireProfile, requireAdmin } from "@/lib/authz";
import { checkImportRateLimit } from "@/lib/rate-limit";
import {
  ingestPartyRows,
  ingestInvoiceRows,
  type ImportResult,
} from "@/lib/import/ingest";
import { syncProvider, type SyncSummary } from "@/lib/integrations/pull";
import { linkOrderToParty } from "@/lib/orders/reconcile";

export type { ImportResult };

export async function linkOrderToPartyAction(
  orderId: string,
  partyId: string
): Promise<{ ok: true } | { error: string }> {
  const profile = await requireAdmin();
  const res = await linkOrderToParty(orderId, partyId, profile.id);
  if ("ok" in res) {
    revalidatePath("/import");
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/production");
  }
  return res;
}

async function importRateLimitError(
  profileId: string
): Promise<{ error: string } | null> {
  const { limited, retryAfterMinutes } = await checkImportRateLimit(profileId);
  return limited
    ? { error: `Too many imports — wait ${retryAfterMinutes} minutes and try again.` }
    : null;
}

export async function importPartiesAction(
  rows: Record<string, string>[]
): Promise<ImportResult | { error: string }> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") return { error: "Admin access required." };
  const limited = await importRateLimitError(profile.id);
  if (limited) return limited;
  return ingestPartyRows(rows, { triggeredById: profile.id, source: "csv" });
}

export async function importInvoicesAction(
  rows: Record<string, string>[]
): Promise<ImportResult | { error: string }> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") return { error: "Admin access required." };
  const limited = await importRateLimitError(profile.id);
  if (limited) return limited;
  return ingestInvoiceRows(rows, { triggeredById: profile.id, source: "csv" });
}

/** On-demand pull from a connected cloud accounting provider. */
export async function syncAccountingProviderAction(
  provider: AccountingProvider
): Promise<SyncSummary | { error: string }> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") return { error: "Admin access required." };
  const limited = await importRateLimitError(profile.id);
  if (limited) return limited;

  const result = await syncProvider(provider, profile.id);
  if (!("error" in result)) {
    revalidatePath("/import");
    revalidatePath("/parties");
    revalidatePath("/invoices");
  }
  return result;
}
