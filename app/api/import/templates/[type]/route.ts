import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// SY27 — Excel import templates for /import.
//
// Two supported types:
//   * customers            → parties.csv-shaped header
//   * outstanding-invoices → invoices.csv-shaped header
//
// Column names match the Tally export (Daybook / Ledger Analysis /
// Bills Receivable) as closely as they reasonably can, so a Tally
// user can paste their own export in without rearranging columns.

const TEMPLATES: Record<string, { filename: string; rows: string[][] }> = {
  customers: {
    filename: "syncit-customers-template.csv",
    rows: [
      [
        "Ledger Name",
        "Mailing Name",
        "GSTIN",
        "Contact Person",
        "Phone",
        "Email",
        "Address",
        "City",
        "State",
        "PIN",
        "Credit Days",
        "Credit Limit",
        "Cost Centre",
        "Tally Ref",
      ],
      [
        "Mehta Trading Co.",
        "Mehta Trading Company",
        "27ABCDE1234F1Z5",
        "Rajesh Mehta",
        "9876543210",
        "accounts@mehta.example",
        "12 Karve Road",
        "Pune",
        "Maharashtra",
        "411004",
        "30",
        "500000",
        "West-Sales",
        "",
      ],
    ],
  },
  "outstanding-invoices": {
    filename: "syncit-outstanding-invoices-template.csv",
    rows: [
      [
        "Ledger Name",
        "Bill Reference",
        "Invoice Number",
        "Invoice Date",
        "Due Date",
        "Bill Amount",
        "Amount Received",
        "Balance",
        "Notes",
        "Tally Ref",
      ],
      [
        "Mehta Trading Co.",
        "MTC/2026-27/0142",
        "MTC/2026-27/0142",
        "2026-09-01",
        "2026-10-01",
        "245000",
        "0",
        "245000",
        "GST invoice",
        "",
      ],
    ],
  },
};

function escapeCell(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

export async function GET(
  _req: Request,
  ctx: { params: { type: string } },
) {
  const tpl = TEMPLATES[ctx.params.type];
  if (!tpl) {
    return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  }
  const body = toCsv(tpl.rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${tpl.filename}"`,
      "cache-control": "public, max-age=3600",
    },
  });
}
