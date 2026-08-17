// THE single ingestion path for parties/invoices/payments coming from
// outside (CSV upload, the Tally LAN agent, cloud accounting pulls).
// Every source produces the same Record<string,string> rows, passes the
// same Zod validation, dedupes on the same keys (tallyRef,
// partyId+invoiceNumber), and is logged to SyncLog. Do not add a second,
// differently-validated ingestion path.

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  deriveInvoiceStatus,
  recomputePartyOutstanding,
} from "@/lib/ar/balance";

export const MAX_ROWS = 5000;

export type ImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[]; // first 20, "row N: message"
  /** Cost-centre values from Tally that matched no Profile.costCentreName. */
  unmatchedCostCentres?: string[];
};

/** Accepts yyyy-mm-dd, dd-mm-yyyy, dd/mm/yyyy (Tally/Excel exports vary). */
function parseCsvDate(raw: string): Date | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const csvDate = z.string().transform((v, ctx) => {
  const d = parseCsvDate(v);
  if (!d) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unrecognised date "${v}" (use YYYY-MM-DD or DD-MM-YYYY)`,
    });
    return z.NEVER;
  }
  return d;
});

const optionalCell = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const partyRowSchema = z.object({
  name: z.string().trim().min(2, "name is required").max(120),
  code: optionalCell(50),
  gstNumber: optionalCell(15),
  phone: optionalCell(15).transform((v) => (v ? v.replace(/\D/g, "").slice(-10) : null)),
  email: optionalCell(200),
  contactPerson: optionalCell(120),
  address: optionalCell(400),
  city: optionalCell(100),
  state: optionalCell(100),
  creditDays: z.preprocess(
    (v) => (v === "" || v == null ? null : parseInt(String(v), 10)),
    z.number().int().min(0).max(365).nullable()
  ),
  // Tally Cost Centre / Sales Executive — used for auto-assignment
  costCentre: optionalCell(120),
  tallyRef: optionalCell(100),
});

const invoiceRowSchema = z.object({
  partyName: z.string().trim().min(1, "partyName is required").max(120),
  invoiceNumber: z.string().trim().min(1, "invoiceNumber is required").max(50),
  invoiceDate: csvDate,
  dueDate: csvDate,
  totalAmount: z.preprocess(
    (v) => Number(String(v).replace(/[₹,\s]/g, "")),
    z.number().positive("totalAmount must be a positive number").max(10_000_000_000)
  ),
  notes: optionalCell(1000),
  tallyRef: optionalCell(100),
  // Passed through from Tally vouchers; applied to the party, not stored on Invoice
  costCentre: optionalCell(120),
});

const stockItemRowSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  category: optionalCell(200),
  unit: optionalCell(50),
  closingQty: z.preprocess(
    (v) => Number(String(v).replace(/[₹,\s]/g, "")),
    z.number().finite("closingQty must be a number").max(10_000_000_000)
  ),
  tallyRef: z.string().trim().min(1, "tallyRef is required").max(100),
});

export type IngestOptions = {
  /** Profile id for UI-triggered imports; null for the Tally agent. */
  triggeredById: string | null;
  /** Free-text source for the SyncLog details (e.g. "csv", "tally-agent", "zoho_books"). */
  source: string;
};

/** Map Profile.costCentreName (lowercased) → profile id for auto-assignment. */
async function loadCostCentreProfileMap(): Promise<Map<string, string>> {
  const profiles = await db.profile.findMany({
    where: { costCentreName: { not: null } },
    select: { id: true, costCentreName: true },
  });
  const map = new Map<string, string>();
  for (const p of profiles) {
    if (p.costCentreName) map.set(p.costCentreName.toLowerCase(), p.id);
  }
  return map;
}

/**
 * Resolve assignedToId from a Tally cost-centre name.
 * Returns the profile id on match; on miss records the value for SyncLog
 * warnings and returns undefined so callers leave assignedToId untouched.
 */
function resolveAssignee(
  costCentre: string | null | undefined,
  costCentreToProfile: Map<string, string>,
  unmatched: Set<string>
): string | undefined {
  if (!costCentre) return undefined;
  const profileId = costCentreToProfile.get(costCentre.toLowerCase());
  if (profileId) return profileId;
  unmatched.add(costCentre);
  return undefined;
}

export async function ingestPartyRows(
  rows: Record<string, string>[],
  opts: IngestOptions
): Promise<ImportResult | { error: string }> {
  if (rows.length === 0) return { error: "No rows to import." };
  if (rows.length > MAX_ROWS) return { error: `Maximum ${MAX_ROWS} rows per import.` };

  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const unmatchedCostCentres = new Set<string>();
  const costCentreToProfile = await loadCostCentreProfileMap();

  const sync = await db.syncLog.create({
    data: {
      syncType: "IMPORT_PARTIES",
      status: "IN_PROGRESS",
      recordsTotal: rows.length,
      triggeredById: opts.triggeredById,
    },
  });

  for (let i = 0; i < rows.length; i++) {
    const parsed = partyRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(`row ${i + 2}: ${parsed.error.errors[0].message}`);
      }
      continue;
    }
    const data = parsed.data;
    const assigneeId = resolveAssignee(
      data.costCentre,
      costCentreToProfile,
      unmatchedCostCentres
    );
    // Don't wipe costCentre / assignedToId when Tally omitted them on this run
    const { costCentre, ...partyFields } = data;
    const assignmentPatch = {
      ...(costCentre ? { costCentre } : {}),
      ...(assigneeId ? { assignedToId: assigneeId } : {}),
    };

    try {
      if (data.tallyRef) {
        const existing = await db.party.findUnique({
          where: { tallyRef: data.tallyRef },
        });
        if (existing) {
          await db.party.update({
            where: { id: existing.id },
            data: { ...partyFields, ...assignmentPatch },
          });
          result.skipped++; // counted as updated-in-place, not a new record
          continue;
        }
      } else {
        const existing = await db.party.findFirst({
          where: { name: { equals: data.name, mode: "insensitive" } },
        });
        if (existing) {
          result.skipped++;
          continue;
        }
      }
      await db.party.create({
        data: { ...partyFields, ...assignmentPatch },
      });
      result.imported++;
    } catch {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(`row ${i + 2}: database error while saving "${data.name}"`);
      }
    }
  }

  const unmatched = Array.from(unmatchedCostCentres).sort();
  result.unmatchedCostCentres = unmatched;

  await db.syncLog.update({
    where: { id: sync.id },
    data: {
      status: result.failed > 0 ? "PARTIAL" : "COMPLETED",
      completedAt: new Date(),
      recordsProcessed: result.imported + result.skipped,
      recordsFailed: result.failed,
      details: {
        source: opts.source,
        errors: result.errors,
        ...(unmatched.length
          ? {
              warning: `Unmatched cost centres (no Profile.costCentreName): ${unmatched.join(", ")}`,
              unmatchedCostCentres: unmatched,
            }
          : {}),
      },
    },
  });

  return result;
}

export async function ingestInvoiceRows(
  rows: Record<string, string>[],
  opts: IngestOptions
): Promise<ImportResult | { error: string }> {
  if (rows.length === 0) return { error: "No rows to import." };
  if (rows.length > MAX_ROWS) return { error: `Maximum ${MAX_ROWS} rows per import.` };

  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const affectedPartyIds = new Set<string>();
  const unmatchedCostCentres = new Set<string>();
  const costCentreToProfile = await loadCostCentreProfileMap();

  const sync = await db.syncLog.create({
    data: {
      syncType: "IMPORT_INVOICES",
      status: "IN_PROGRESS",
      recordsTotal: rows.length,
      triggeredById: opts.triggeredById,
    },
  });

  for (let i = 0; i < rows.length; i++) {
    const parsed = invoiceRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(`row ${i + 2}: ${parsed.error.errors[0].message}`);
      }
      continue;
    }
    const { costCentre, ...invoiceData } = parsed.data;

    try {
      const party = await db.party.findFirst({
        where: { name: { equals: invoiceData.partyName, mode: "insensitive" } },
      });
      if (!party) {
        result.failed++;
        if (result.errors.length < 20) {
          result.errors.push(
            `row ${i + 2}: party "${invoiceData.partyName}" not found — import parties first`
          );
        }
        continue;
      }

      // Apply voucher cost centre onto the party + auto-assign when mapped
      if (costCentre) {
        const assigneeId = resolveAssignee(
          costCentre,
          costCentreToProfile,
          unmatchedCostCentres
        );
        await db.party.update({
          where: { id: party.id },
          data: {
            costCentre,
            ...(assigneeId ? { assignedToId: assigneeId } : {}),
          },
        });
      }

      const existing = await db.invoice.findUnique({
        where: {
          partyId_invoiceNumber: {
            partyId: party.id,
            invoiceNumber: invoiceData.invoiceNumber,
          },
        },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const total = new Prisma.Decimal(invoiceData.totalAmount);
      await db.invoice.create({
        data: {
          partyId: party.id,
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: invoiceData.invoiceDate,
          dueDate: invoiceData.dueDate,
          totalAmount: total,
          notes: invoiceData.notes,
          tallyRef: invoiceData.tallyRef,
          source: invoiceData.tallyRef ? "TALLY" : "MANUAL",
          status: deriveInvoiceStatus(total, new Prisma.Decimal(0), invoiceData.dueDate),
        },
      });
      affectedPartyIds.add(party.id);
      result.imported++;
    } catch {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(
          `row ${i + 2}: database error while saving invoice "${invoiceData.invoiceNumber}"`
        );
      }
    }
  }

  for (const partyId of Array.from(affectedPartyIds)) {
    await db.$transaction((tx) => recomputePartyOutstanding(tx, partyId));
  }

  const unmatched = Array.from(unmatchedCostCentres).sort();
  result.unmatchedCostCentres = unmatched;

  await db.syncLog.update({
    where: { id: sync.id },
    data: {
      status: result.failed > 0 ? "PARTIAL" : "COMPLETED",
      completedAt: new Date(),
      recordsProcessed: result.imported + result.skipped,
      recordsFailed: result.failed,
      details: {
        source: opts.source,
        errors: result.errors,
        ...(unmatched.length
          ? {
              warning: `Unmatched cost centres (no Profile.costCentreName): ${unmatched.join(", ")}`,
              unmatchedCostCentres: unmatched,
            }
          : {}),
      },
    },
  });

  return result;
}

export async function ingestStockItemRows(
  rows: Record<string, string>[],
  opts: IngestOptions
): Promise<ImportResult | { error: string }> {
  if (rows.length === 0) return { error: "No rows to import." };
  if (rows.length > MAX_ROWS) return { error: `Maximum ${MAX_ROWS} rows per import.` };

  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const syncedAt = new Date();

  const sync = await db.syncLog.create({
    data: {
      syncType: "IMPORT_STOCK_ITEMS",
      status: "IN_PROGRESS",
      recordsTotal: rows.length,
      triggeredById: opts.triggeredById,
    },
  });

  for (let i = 0; i < rows.length; i++) {
    const parsed = stockItemRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(`row ${i + 2}: ${parsed.error.errors[0].message}`);
      }
      continue;
    }
    const data = parsed.data;
    const closingQty = new Prisma.Decimal(data.closingQty);

    try {
      const existing = await db.stockItem.findUnique({
        where: { tallyRef: data.tallyRef },
      });
      if (existing) {
        // Always bump lastSyncedAt — even when quantities are unchanged —
        // so the factory UI can tell a fresh sync from a stale snapshot.
        await db.stockItem.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            category: data.category,
            unit: data.unit,
            closingQty,
            lastSyncedAt: syncedAt,
          },
        });
        result.skipped++;
        continue;
      }

      // Name is also unique — if a manual row collides, attach the tallyRef
      const byName = await db.stockItem.findUnique({ where: { name: data.name } });
      if (byName) {
        await db.stockItem.update({
          where: { id: byName.id },
          data: {
            category: data.category,
            unit: data.unit,
            closingQty,
            tallyRef: data.tallyRef,
            lastSyncedAt: syncedAt,
          },
        });
        result.skipped++;
        continue;
      }

      await db.stockItem.create({
        data: {
          name: data.name,
          category: data.category,
          unit: data.unit,
          closingQty,
          tallyRef: data.tallyRef,
          lastSyncedAt: syncedAt,
        },
      });
      result.imported++;
    } catch {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(
          `row ${i + 2}: database error while saving stock item "${data.name}"`
        );
      }
    }
  }

  await db.syncLog.update({
    where: { id: sync.id },
    data: {
      status: result.failed > 0 ? "PARTIAL" : "COMPLETED",
      completedAt: new Date(),
      recordsProcessed: result.imported + result.skipped,
      recordsFailed: result.failed,
      details: { source: opts.source, errors: result.errors },
    },
  });

  return result;
}
