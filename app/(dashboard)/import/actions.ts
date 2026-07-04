"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import {
  deriveInvoiceStatus,
  recomputePartyOutstanding,
} from "@/lib/ar/balance";

const MAX_ROWS = 5000;

export type ImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[]; // first 20, "row N: message"
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

const csvDate = z
  .string()
  .transform((v, ctx) => {
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
});

export async function importPartiesAction(
  rows: Record<string, string>[]
): Promise<ImportResult | { error: string }> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") return { error: "Admin access required." };
  if (rows.length === 0) return { error: "No rows to import." };
  if (rows.length > MAX_ROWS) return { error: `Maximum ${MAX_ROWS} rows per import.` };

  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

  const sync = await db.syncLog.create({
    data: {
      syncType: "IMPORT_PARTIES",
      status: "IN_PROGRESS",
      recordsTotal: rows.length,
      triggeredById: profile.id,
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

    try {
      if (data.tallyRef) {
        const existing = await db.party.findUnique({
          where: { tallyRef: data.tallyRef },
        });
        if (existing) {
          await db.party.update({ where: { id: existing.id }, data });
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
      await db.party.create({ data });
      result.imported++;
    } catch {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(`row ${i + 2}: database error while saving "${data.name}"`);
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
      details: { errors: result.errors },
    },
  });

  return result;
}

export async function importInvoicesAction(
  rows: Record<string, string>[]
): Promise<ImportResult | { error: string }> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") return { error: "Admin access required." };
  if (rows.length === 0) return { error: "No rows to import." };
  if (rows.length > MAX_ROWS) return { error: `Maximum ${MAX_ROWS} rows per import.` };

  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const affectedPartyIds = new Set<string>();

  const sync = await db.syncLog.create({
    data: {
      syncType: "IMPORT_INVOICES",
      status: "IN_PROGRESS",
      recordsTotal: rows.length,
      triggeredById: profile.id,
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
    const data = parsed.data;

    try {
      const party = await db.party.findFirst({
        where: { name: { equals: data.partyName, mode: "insensitive" } },
      });
      if (!party) {
        result.failed++;
        if (result.errors.length < 20) {
          result.errors.push(
            `row ${i + 2}: party "${data.partyName}" not found — import parties first`
          );
        }
        continue;
      }

      const existing = await db.invoice.findUnique({
        where: {
          partyId_invoiceNumber: {
            partyId: party.id,
            invoiceNumber: data.invoiceNumber,
          },
        },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const total = new Prisma.Decimal(data.totalAmount);
      await db.invoice.create({
        data: {
          partyId: party.id,
          invoiceNumber: data.invoiceNumber,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          totalAmount: total,
          notes: data.notes,
          tallyRef: data.tallyRef,
          source: data.tallyRef ? "TALLY" : "MANUAL",
          status: deriveInvoiceStatus(total, new Prisma.Decimal(0), data.dueDate),
        },
      });
      affectedPartyIds.add(party.id);
      result.imported++;
    } catch {
      result.failed++;
      if (result.errors.length < 20) {
        result.errors.push(
          `row ${i + 2}: database error while saving invoice "${data.invoiceNumber}"`
        );
      }
    }
  }

  for (const partyId of Array.from(affectedPartyIds)) {
    await db.$transaction((tx) => recomputePartyOutstanding(tx, partyId));
  }

  await db.syncLog.update({
    where: { id: sync.id },
    data: {
      status: result.failed > 0 ? "PARTIAL" : "COMPLETED",
      completedAt: new Date(),
      recordsProcessed: result.imported + result.skipped,
      recordsFailed: result.failed,
      details: { errors: result.errors },
    },
  });

  return result;
}
