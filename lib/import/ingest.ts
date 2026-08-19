// THE single ingestion path for parties/invoices/payments coming from
// outside (CSV upload, the Tally LAN agent, cloud accounting pulls).
// Every source produces the same Record<string,string> rows, passes the
// same Zod validation, dedupes on the same keys (tallyRef,
// partyId+invoiceNumber), and is logged to SyncLog. Do not add a second,
// differently-validated ingestion path.

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient;
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
  // Party ledger closing balance from Tally (snapshot, signed —
  // positive when the customer owes us).
  tallyOutstanding: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(String(v).replace(/[₹,\s]/g, ""))),
      z.number().finite().nullable(),
    )
    .optional(),
});

const receiptAllocationSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(50),
  amount: z.preprocess(
    (v) => Number(String(v).replace(/[₹,\s]/g, "")),
    z.number().nonnegative().max(10_000_000_000),
  ),
  billType: z.string().trim().max(30).optional(),
});

const receiptRowSchema = z.object({
  voucherNumber: z.string().trim().min(1).max(50),
  date: csvDate,
  partyName: z.string().trim().min(1).max(120),
  totalAmount: z.preprocess(
    (v) => Number(String(v).replace(/[₹,\s]/g, "")),
    z.number().positive().max(10_000_000_000),
  ),
  tallyRef: z.string().trim().min(1).max(100),
  allocations: z.array(receiptAllocationSchema).max(500).default([]),
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
    const { costCentre, tallyOutstanding, ...partyFields } = data;
    const assignmentPatch = {
      ...(costCentre ? { costCentre } : {}),
      ...(assigneeId ? { assignedToId: assigneeId } : {}),
    };
    // Snapshot the Tally ledger closing balance whenever it's provided.
    // The reconciliation report reads this against the app-computed
    // totalOutstanding to catch sync bugs.
    const tallySnapshot =
      tallyOutstanding == null
        ? {}
        : {
            tallyOutstanding: new Prisma.Decimal(tallyOutstanding),
            tallyBalanceAsOf: new Date(),
          };

    try {
      if (data.tallyRef) {
        const existing = await db.party.findUnique({
          where: { tallyRef: data.tallyRef },
        });
        if (existing) {
          await db.party.update({
            where: { id: existing.id },
            data: { ...partyFields, ...assignmentPatch, ...tallySnapshot },
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
        data: { ...partyFields, ...assignmentPatch, ...tallySnapshot },
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

/**
 * Tally receipt vouchers → Payment rows, one per bill allocation, plus
 * one on-account row for any unallocated remainder. Idempotent: each
 * synthesised row's tallyRef is
 *   `receipt:<guid>:<invoice-number>` for allocated rows
 *   `receipt:<guid>:onaccount`        for the residual
 * and Payment.tallyRef is DB-unique on non-null values.
 *
 * Sync bug that this closes: prior versions of sync-core.mjs only
 * imported sales vouchers, so outstanding balances only ever went up,
 * never down. Customers with genuine payments looked delinquent, and
 * credit-limit blocking in lib/orders/create.ts refused otherwise-fine
 * orders.
 */
export async function ingestReceiptRows(
  rows: Array<Record<string, unknown>>,
  opts: IngestOptions,
): Promise<ImportResult | { error: string }> {
  if (rows.length === 0) return { error: "No rows to import." };
  if (rows.length > MAX_ROWS)
    return { error: `Maximum ${MAX_ROWS} rows per import.` };

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const affectedPartyIds = new Set<string>();

  const sync = await db.syncLog.create({
    data: {
      syncType: "IMPORT_RECEIPTS",
      status: "IN_PROGRESS",
      recordsTotal: rows.length,
      triggeredById: opts.triggeredById,
    },
  });

  for (let i = 0; i < rows.length; i++) {
    const parsed = receiptRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(`row ${i + 2}: ${parsed.error.errors[0].message}`);
      }
      continue;
    }
    const r = parsed.data;

    try {
      const party = await db.party.findFirst({
        where: { name: { equals: r.partyName, mode: "insensitive" } },
      });
      if (!party) {
        result.failed++;
        if (result.errors.length < 20) {
          result.errors.push(
            `row ${i + 2}: party "${r.partyName}" not found — import parties first`,
          );
        }
        continue;
      }

      // Resolve invoices for each allocation up front. Skip allocations
      // that don't match any Invoice — those become on-account amounts
      // rather than failing the whole receipt.
      const allocationsWithInvoice = [] as Array<{
        invoiceNumber: string;
        amount: Prisma.Decimal;
        invoiceId: string;
        priorPaid: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
        creditedAmount: Prisma.Decimal;
        dueDate: Date;
      }>;
      let unmatchedAmount = new Prisma.Decimal(0);
      for (const a of r.allocations) {
        const amt = new Prisma.Decimal(a.amount);
        if (amt.isZero()) continue;
        const inv = await db.invoice.findUnique({
          where: {
            partyId_invoiceNumber: {
              partyId: party.id,
              invoiceNumber: a.invoiceNumber,
            },
          },
          select: {
            id: true,
            paidAmount: true,
            totalAmount: true,
            creditedAmount: true,
            dueDate: true,
          },
        });
        if (!inv) {
          // Bill exists in Tally's ledger but not on our side yet.
          // Treat as on-account until the invoice syncs; a later
          // receipt-sync run will find it and re-allocate.
          unmatchedAmount = unmatchedAmount.plus(amt);
          continue;
        }
        allocationsWithInvoice.push({
          invoiceNumber: a.invoiceNumber,
          amount: amt,
          invoiceId: inv.id,
          priorPaid: inv.paidAmount,
          totalAmount: inv.totalAmount,
          creditedAmount: inv.creditedAmount,
          dueDate: inv.dueDate,
        });
      }

      const allocated = allocationsWithInvoice.reduce(
        (acc, a) => acc.plus(a.amount),
        new Prisma.Decimal(0),
      );
      const total = new Prisma.Decimal(r.totalAmount);
      const onAccount = total
        .minus(allocated)
        .minus(unmatchedAmount)
        // Tally-side rounding may push us a paisa negative; clamp.
        .toDecimalPlaces(2);
      const residual = onAccount.lessThan(0)
        ? new Prisma.Decimal(0)
        : onAccount.plus(unmatchedAmount);

      await db.$transaction(async (tx) => {
        for (const a of allocationsWithInvoice) {
          const ref = `${r.tallyRef}:${a.invoiceNumber}`;
          const existing = await tx.payment.findUnique({
            where: { tallyRef: ref },
            select: { id: true, amount: true },
          });
          if (existing) {
            // Amount can drift if Tally was edited after our last pull.
            // Update the row + adjust invoice.paidAmount by the delta.
            const delta = a.amount.minus(existing.amount);
            if (!delta.isZero()) {
              await tx.payment.update({
                where: { id: existing.id },
                data: {
                  amount: a.amount,
                  paymentDate: r.date,
                  reference: r.voucherNumber,
                },
              });
              const newPaid = a.priorPaid.plus(delta);
              await tx.invoice.update({
                where: { id: a.invoiceId },
                data: {
                  paidAmount: newPaid,
                  status: deriveInvoiceStatus(
                    a.totalAmount,
                    newPaid.plus(a.creditedAmount),
                    a.dueDate,
                  ),
                },
              });
            }
            result.skipped++;
            continue;
          }
          await tx.payment.create({
            data: {
              partyId: party.id,
              invoiceId: a.invoiceId,
              amount: a.amount,
              paymentDate: r.date,
              method: "OTHER",
              reference: r.voucherNumber,
              source: "TALLY",
              tallyRef: ref,
              // Recorded-by must be non-null; use a well-known system
              // profile id if configured, else fall back to any admin.
              recordedById: await systemProfileId(tx),
            },
          });
          const newPaid = a.priorPaid.plus(a.amount);
          await tx.invoice.update({
            where: { id: a.invoiceId },
            data: {
              paidAmount: newPaid,
              status: deriveInvoiceStatus(
                a.totalAmount,
                newPaid.plus(a.creditedAmount),
                a.dueDate,
              ),
            },
          });
          result.imported++;
        }

        if (residual.greaterThan(0)) {
          const ref = `${r.tallyRef}:onaccount`;
          const existing = await tx.payment.findUnique({
            where: { tallyRef: ref },
            select: { id: true, amount: true },
          });
          if (existing) {
            if (!existing.amount.equals(residual)) {
              await tx.payment.update({
                where: { id: existing.id },
                data: {
                  amount: residual,
                  paymentDate: r.date,
                  reference: r.voucherNumber,
                },
              });
            }
            result.skipped++;
          } else {
            await tx.payment.create({
              data: {
                partyId: party.id,
                invoiceId: null,
                amount: residual,
                paymentDate: r.date,
                method: "OTHER",
                reference: r.voucherNumber,
                source: "TALLY",
                tallyRef: ref,
                recordedById: await systemProfileId(tx),
              },
            });
            result.imported++;
          }
        }

        await recomputePartyOutstanding(tx, party.id);
      });
      affectedPartyIds.add(party.id);
    } catch (e) {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(
          `row ${i + 2}: database error while saving receipt "${r.voucherNumber}": ${
            e instanceof Error ? e.message : String(e)
          }`,
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
      details: {
        source: opts.source,
        errors: result.errors,
        partiesTouched: affectedPartyIds.size,
      },
    },
  });

  return result;
}

// Payment.recordedById is UUID + NOT NULL. Tally imports have no
// human triggerer, so fall back to the first ADMIN in the system.
// Cached across a request to avoid per-row lookups. If no admin
// exists yet the ingest throws — this must be seeded before Tally
// sync runs against a real project.
let _cachedSystemProfileId: string | null = null;
async function systemProfileId(tx: Tx | typeof db): Promise<string> {
  if (_cachedSystemProfileId) return _cachedSystemProfileId;
  const admin = await tx.profile.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) {
    throw new Error(
      "No ADMIN profile exists to attribute Tally-imported receipts to.",
    );
  }
  _cachedSystemProfileId = admin.id;
  return admin.id;
}
