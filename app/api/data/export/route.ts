import { NextResponse, type NextRequest } from "next/server";
import { requireProfileApi } from "@/lib/authz";
import { db } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/export";

export const dynamic = "force-dynamic";

// Full-dataset export for the distributor's own records and data
// portability. Admin only. Messages have their own richer export at
// /api/messages/export.
// GET /api/data/export?entity=parties|invoices|payments|actions|credit-notes|proformas|all&format=csv|json
// `entity=all` returns a single JSON bundle (CSV is per-entity only).
const ROW_CAP = 50_000;

async function partiesRows() {
  const rows = await db.party.findMany({
    include: { assignedTo: { select: { ownerName: true } } },
    orderBy: { createdAt: "asc" },
    take: ROW_CAP,
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code ?? "",
    gstNumber: p.gstNumber ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    contactPerson: p.contactPerson ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    creditLimit: p.creditLimit?.toString() ?? "",
    creditDays: p.creditDays?.toString() ?? "",
    totalOutstanding: p.totalOutstanding.toString(),
    priority: p.priority,
    riskLevel: p.riskLevel,
    isActive: String(p.isActive),
    assignedTo: p.assignedTo?.ownerName ?? "",
    consentStatus: p.consentStatus,
    outreachPaused: String(p.outreachPaused),
    tallyRef: p.tallyRef ?? "",
    createdAt: p.createdAt.toISOString(),
  }));
}

async function invoicesRows() {
  const rows = await db.invoice.findMany({
    include: { party: { select: { name: true } } },
    orderBy: { invoiceDate: "asc" },
    take: ROW_CAP,
  });
  return rows.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    party: i.party.name,
    invoiceDate: i.invoiceDate.toISOString().slice(0, 10),
    dueDate: i.dueDate.toISOString().slice(0, 10),
    totalAmount: i.totalAmount.toString(),
    paidAmount: i.paidAmount.toString(),
    creditedAmount: i.creditedAmount.toString(),
    pendingAmount: i.totalAmount
      .minus(i.paidAmount)
      .minus(i.creditedAmount)
      .toString(),
    status: i.status,
    source: i.source,
    tallyRef: i.tallyRef ?? "",
    notes: i.notes ?? "",
    createdAt: i.createdAt.toISOString(),
  }));
}

async function paymentsRows() {
  const rows = await db.payment.findMany({
    include: {
      party: { select: { name: true } },
      invoice: { select: { invoiceNumber: true } },
      recordedBy: { select: { ownerName: true } },
    },
    orderBy: { paymentDate: "asc" },
    take: ROW_CAP,
  });
  return rows.map((p) => ({
    id: p.id,
    party: p.party.name,
    invoiceNumber: p.invoice?.invoiceNumber ?? "",
    amount: p.amount.toString(),
    paymentDate: p.paymentDate.toISOString().slice(0, 10),
    method: p.method,
    reference: p.reference ?? "",
    notes: p.notes ?? "",
    recordedBy: p.recordedBy.ownerName,
    source: p.source,
    tallyRef: p.tallyRef ?? "",
    createdAt: p.createdAt.toISOString(),
  }));
}

async function actionsRows() {
  const rows = await db.action.findMany({
    include: {
      party: { select: { name: true } },
      performedBy: { select: { ownerName: true } },
    },
    orderBy: { performedAt: "asc" },
    take: ROW_CAP,
  });
  return rows.map((a) => ({
    id: a.id,
    party: a.party.name,
    type: a.type,
    outcome: a.outcome ?? "",
    notes: a.notes ?? "",
    contactedPerson: a.contactedPerson ?? "",
    promiseDate: a.promiseDate?.toISOString().slice(0, 10) ?? "",
    promiseAmount: a.promiseAmount?.toString() ?? "",
    nextFollowUpDate: a.nextFollowUpDate?.toISOString().slice(0, 10) ?? "",
    performedBy: a.performedBy.ownerName,
    performedAt: a.performedAt.toISOString(),
  }));
}

async function creditNotesRows() {
  const rows = await db.creditNote.findMany({
    include: {
      party: { select: { name: true } },
      invoice: { select: { invoiceNumber: true } },
      issuedBy: { select: { ownerName: true } },
      cancelledBy: { select: { ownerName: true } },
    },
    orderBy: { issuedAt: "asc" },
    take: ROW_CAP,
  });
  return rows.map((c) => ({
    id: c.id,
    creditNoteNumber: c.creditNoteNumber,
    party: c.party.name,
    invoiceNumber: c.invoice.invoiceNumber,
    amount: c.amount.toString(),
    reason: c.reason,
    status: c.status,
    issuedBy: c.issuedBy.ownerName,
    issuedAt: c.issuedAt.toISOString(),
    cancelledBy: c.cancelledBy?.ownerName ?? "",
    cancelledAt: c.cancelledAt?.toISOString() ?? "",
  }));
}

async function proformasRows() {
  const rows = await db.proformaInvoice.findMany({
    include: {
      party: { select: { name: true } },
      createdBy: { select: { ownerName: true } },
    },
    orderBy: { issueDate: "asc" },
    take: ROW_CAP,
  });
  return rows.map((p) => ({
    id: p.id,
    proformaNumber: p.proformaNumber,
    party: p.party.name,
    issueDate: p.issueDate.toISOString().slice(0, 10),
    validUntil: p.validUntil?.toISOString().slice(0, 10) ?? "",
    status: p.status,
    subtotal: p.subtotal.toString(),
    taxAmount: p.taxAmount.toString(),
    totalAmount: p.totalAmount.toString(),
    convertedToInvoiceId: p.convertedToInvoiceId ?? "",
    createdBy: p.createdBy.ownerName,
    createdAt: p.createdAt.toISOString(),
  }));
}

const ENTITIES = {
  parties: partiesRows,
  invoices: invoicesRows,
  payments: paymentsRows,
  actions: actionsRows,
  "credit-notes": creditNotesRows,
  proformas: proformasRows,
} as const;

type Entity = keyof typeof ENTITIES;

export async function GET(request: NextRequest) {
  const { failure } = await requireProfileApi({ adminOnly: true });
  if (failure) return failure;

  const params = request.nextUrl.searchParams;
  const entity = params.get("entity") ?? "all";
  const format = params.get("format") === "json" ? "json" : "csv";
  const stamp = new Date().toISOString().slice(0, 10);

  if (entity === "all") {
    const [parties, invoices, payments, actions, creditNotes, proformas] =
      await Promise.all([
        partiesRows(),
        invoicesRows(),
        paymentsRows(),
        actionsRows(),
        creditNotesRows(),
        proformasRows(),
      ]);
    return NextResponse.json(
      { exportedAt: new Date().toISOString(), parties, invoices, payments, actions, creditNotes, proformas },
      {
        headers: {
          "Content-Disposition": `attachment; filename="synworks-export-${stamp}.json"`,
        },
      }
    );
  }

  if (!(entity in ENTITIES)) {
    return NextResponse.json(
      { error: `Unknown entity. Use one of: ${Object.keys(ENTITIES).join(", ")}, all` },
      { status: 400 }
    );
  }

  const rows = await ENTITIES[entity as Entity]();

  if (format === "json") {
    return NextResponse.json(rows, {
      headers: {
        "Content-Disposition": `attachment; filename="${entity}-${stamp}.json"`,
      },
    });
  }
  return csvResponse(toCsv(rows), `${entity}-${stamp}.csv`);
}
