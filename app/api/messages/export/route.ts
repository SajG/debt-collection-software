import { NextResponse, type NextRequest } from "next/server";
import { requireProfileApi } from "@/lib/authz";
import { db } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/export";

export const dynamic = "force-dynamic";

// Exportable outreach audit trail: every attempt (including gate-blocked),
// delivery status, and inbound replies. Admin only.
// GET /api/messages/export?format=csv|json[&from=YYYY-MM-DD&to=YYYY-MM-DD]
export async function GET(request: NextRequest) {
  const { failure } = await requireProfileApi({ adminOnly: true });
  if (failure) return failure;

  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "json" ? "json" : "csv";
  const from = params.get("from") ? new Date(params.get("from")!) : undefined;
  const to = params.get("to") ? new Date(params.get("to")!) : undefined;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const messages = await db.message.findMany({
    where: {
      createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
    },
    include: {
      party: { select: { name: true, phone: true } },
      invoice: { select: { invoiceNumber: true } },
      sentBy: { select: { ownerName: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });

  const rows = messages.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    direction: m.direction,
    channel: m.channel,
    status: m.status,
    party: m.party.name,
    partyPhone: m.party.phone ?? "",
    invoiceNumber: m.invoice?.invoiceNumber ?? "",
    templateName: m.templateName ?? "",
    body: m.body,
    gateResult: m.gateResult ?? "",
    providerMessageId: m.providerMessageId ?? "",
    error: m.error ?? "",
    paymentLinkUrl: m.paymentLinkUrl ?? "",
    sentBy: m.sentBy?.ownerName ?? (m.direction === "OUTBOUND" ? "system" : ""),
    sentAt: m.sentAt?.toISOString() ?? "",
    deliveredAt: m.deliveredAt?.toISOString() ?? "",
  }));

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return NextResponse.json(rows, {
      headers: {
        "Content-Disposition": `attachment; filename="messages-${stamp}.json"`,
      },
    });
  }

  return csvResponse(toCsv(rows), `messages-${stamp}.csv`);
}
