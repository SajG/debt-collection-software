import { NextResponse } from "next/server";
import { buildAgeingTemplate } from "@/lib/tools/ageing-template";

export const dynamic = "force-dynamic";

// GET /tools/outstanding-ageing-template/download — the workbook is
// built on the server at request time (so the sample rows are dated
// relative to today) and sent as a file. No input, no tracking.
export async function GET() {
  const buffer = buildAgeingTemplate(new Date());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="outstanding-ageing-template.xlsx"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
