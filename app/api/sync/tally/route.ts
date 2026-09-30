import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";
import { hashSecret } from "@/lib/tally/pairing";
import { verifyBearer } from "@/lib/auth/verify-bearer";
import {
  ingestPartyRows,
  ingestInvoiceRows,
  ingestReceiptRows,
  ingestStockItemRows,
  MAX_ROWS,
} from "@/lib/import/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SY27 — Tally sync receiver.
//
// Auth precedence:
//   1. `Authorization: Bearer syt_<token>` → resolves TallyConnector →
//      organizationId. Every row lands in THAT tenant. This is the
//      per-org flow every new customer uses.
//   2. Legacy `Authorization: Bearer $TALLY_SYNC_SECRET` → falls back
//      to the Synergy tenant via getDefaultOrgId(). Kept alive until
//      Synergy re-pairs with a real code; remove the env var after
//      that (see docs/TALLY.md).
//
// Rows are still the exact CSV-import shape and still route through
// lib/import/ingest.ts (Zod validation, tallyRef dedupe, SyncLog).
// The only change from the old contract: ingest now stamps
// organizationId on every row instead of implicitly using Synergy.
//
// ─── CONTRACT: MERGE, NEVER TRUNCATE-AND-REPLACE ────────────────────
// This endpoint is safe to call after weeks or months of manually
// created Parties, Invoices, Payments, and SalesOrders. The ingest
// helpers below match on tallyRef (the Tally GUID) and upsert; a row
// that already exists is UPDATED in place, never deleted, and a
// manually created row (tallyRef = null) is never touched by this
// route. If you ever add a "delete-what-Tally-doesn't-know" pass in
// this route, it will silently wipe the field-recorded ledgers of
// every distributor still running Tally-deferred. Don't.

const rowArray = z.array(z.record(z.string())).max(MAX_ROWS);
const receiptArray = z.array(z.record(z.unknown())).max(MAX_ROWS);
const payloadSchema = z.object({
  parties: rowArray.optional(),
  invoices: rowArray.optional(),
  receipts: receiptArray.optional(),
  stockItems: rowArray.optional(),
});

type AuthResult =
  | { kind: "token"; organizationId: string; connectorId: string }
  | { kind: "legacy" }
  | null;

async function authenticate(request: NextRequest): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const secret = match[1].trim();

  // SY27 per-org token.
  if (secret.startsWith("syt_")) {
    const connector = await db.tallyConnector.findUnique({
      where: { tokenHash: hashSecret(secret) },
    });
    if (!connector) return null;
    if (connector.revokedAt) return null;
    return {
      kind: "token",
      organizationId: connector.organizationId,
      connectorId: connector.id,
    };
  }

  // Legacy Synergy secret. verifyBearer is timing-safe.
  if (verifyBearer(header, process.env.TALLY_SYNC_SECRET)) {
    return { kind: "legacy" };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const opts = {
    triggeredById: null,
    source: auth.kind === "token" ? "tally-connector" : "tally-agent-legacy",
    ...(auth.kind === "token" ? { organizationId: auth.organizationId } : {}),
  };

  const summary: Record<string, unknown> = {};
  let totalRows = 0;
  let firstError: string | null = null;

  try {
    if (parsed.data.parties?.length) {
      summary.parties = await ingestPartyRows(parsed.data.parties, opts);
      totalRows += parsed.data.parties.length;
    }
    if (parsed.data.invoices?.length) {
      summary.invoices = await ingestInvoiceRows(parsed.data.invoices, opts);
      totalRows += parsed.data.invoices.length;
    }
    if (parsed.data.receipts?.length) {
      summary.receipts = await ingestReceiptRows(parsed.data.receipts, opts);
      totalRows += parsed.data.receipts.length;
    }
    if (parsed.data.stockItems?.length) {
      summary.stockItems = await ingestStockItemRows(parsed.data.stockItems, opts);
      totalRows += parsed.data.stockItems.length;
    }
  } catch (e) {
    firstError = e instanceof Error ? e.message : String(e);
    await captureError(e, {
      scope: "api.sync.tally",
      authKind: auth.kind,
      ...(auth.kind === "token" ? { organizationId: auth.organizationId } : {}),
    });
  }

  if (totalRows === 0 && !firstError) {
    return NextResponse.json(
      { error: "Send parties, invoices, receipts, and/or stockItems" },
      { status: 400 },
    );
  }

  // Per-connector telemetry — lets Settings → Tally show "synced 12 min ago"
  // and surface the last failure in plain language.
  if (auth.kind === "token") {
    const now = new Date();
    await db.tallyConnector
      .update({
        where: { id: auth.connectorId },
        data: {
          lastSeenAt: now,
          ...(firstError
            ? { lastError: firstError.slice(0, 500) }
            : {
                lastSyncAt: now,
                lastError: null,
                rowsSyncedTotal: { increment: totalRows },
              }),
        },
      })
      .catch(() => undefined);
  }

  if (firstError) {
    return NextResponse.json(
      { error: "Sync failed. Check Settings → Tally for details." },
      { status: 500 },
    );
  }

  return NextResponse.json(summary);
}
