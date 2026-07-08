import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ingestPartyRows, ingestInvoiceRows, MAX_ROWS } from "@/lib/import/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Receiver for the Tally LAN sync agent (tools/tally-sync-agent.mjs).
// Tally's XML-over-HTTP port lives on the distributor's local network and
// is not reachable from this deployment, so the agent runs next to Tally
// and PUSHES here. Authenticated like the cron route:
// `Authorization: Bearer $TALLY_SYNC_SECRET`.
//
// Rows are the exact CSV-import shape and go through the same ingest
// pipeline (Zod validation, tallyRef dedupe, SyncLog) as a CSV upload.

const rowArray = z.array(z.record(z.string())).max(MAX_ROWS);
const payloadSchema = z.object({
  parties: rowArray.optional(),
  invoices: rowArray.optional(),
});

export async function POST(request: NextRequest) {
  const secret = process.env.TALLY_SYNC_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
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
      { status: 400 }
    );
  }

  const opts = { triggeredById: null, source: "tally-agent" };
  const summary: Record<string, unknown> = {};

  if (parsed.data.parties?.length) {
    summary.parties = await ingestPartyRows(parsed.data.parties, opts);
  }
  if (parsed.data.invoices?.length) {
    summary.invoices = await ingestInvoiceRows(parsed.data.invoices, opts);
  }
  if (!parsed.data.parties?.length && !parsed.data.invoices?.length) {
    return NextResponse.json({ error: "Send parties and/or invoices" }, { status: 400 });
  }

  return NextResponse.json(summary);
}
