// SERVER-ONLY — loads one customer's ledger through a tenantDb client
// (so it can only ever read the caller's company) and renders the
// statement PDF. The decrypted bank account number exists only inside
// this call and the PDF bytes.

import type { TenantClient } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";
import { formatDate, toNumber } from "@/lib/format";
import { downloadLogoBytes } from "@/lib/storage";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/ar/aging";
import { buildStatement, defaultStatementPeriod } from "@/lib/ar/statement";
import { getOrCreatePaymentLink, razorpayCredsFor } from "@/lib/payments/razorpay";
import { renderStatementPdf } from "./statement";

const rs = (n: number) =>
  (n < 0 ? "-" : "") +
  "Rs. " +
  Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rsOrBlank = (n: number) => (n === 0 ? "" : rs(n));

export type StatementPdfResult =
  | { filename: string; buffer: Buffer; closingBalance: number }
  | { error: string };

export async function buildStatementPdf(
  db: TenantClient,
  organizationId: string,
  partyId: string,
  opts: { now?: Date } = {},
): Promise<StatementPdfResult> {
  const now = opts.now ?? new Date();
  const { from, to } = defaultStatementPeriod(now);

  const [party, settings, org] = await Promise.all([
    db.party.findUnique({
      where: { id: partyId },
      include: {
        invoices: { select: { invoiceNumber: true, invoiceDate: true, dueDate: true, totalAmount: true, paidAmount: true, creditedAmount: true, status: true } },
        payments: { select: { paymentDate: true, amount: true, method: true, reference: true, invoice: { select: { invoiceNumber: true } } } },
        creditNotes: { select: { creditNoteNumber: true, issuedAt: true, amount: true, status: true, invoice: { select: { invoiceNumber: true } } } },
      },
    }),
    db.businessSettings.findFirst(),
    db.organization.findFirst({ select: { name: true } }),
  ]);
  if (!party) return { error: "Customer not found" };
  const companyName = org?.name ?? "Your supplier";

  const statement = buildStatement({
    from,
    to,
    invoices: party.invoices.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      totalAmount: toNumber(i.totalAmount),
      paidAmount: toNumber(i.paidAmount),
      creditedAmount: toNumber(i.creditedAmount),
      cancelled: i.status === "CANCELLED",
    })),
    payments: party.payments.map((p) => ({
      paymentDate: p.paymentDate,
      amount: toNumber(p.amount),
      method: p.method,
      reference: p.reference,
      invoiceNumber: p.invoice?.invoiceNumber ?? null,
    })),
    creditNotes: party.creditNotes.map((c) => ({
      creditNoteNumber: c.creditNoteNumber,
      issuedAt: c.issuedAt,
      amount: toNumber(c.amount),
      invoiceNumber: c.invoice?.invoiceNumber ?? null,
      cancelled: c.status === "CANCELLED",
    })),
  });

  // "Pay now" only when this company has its own Razorpay keys and
  // something is owed. Best-effort: the statement renders without it.
  let payNowUrl: string | null = null;
  if (statement.closingBalance > 0) {
    const creds = await razorpayCredsFor(organizationId);
    if (creds) {
      const link = await getOrCreatePaymentLink(db, creds, {
        partyId: party.id,
        invoiceId: null,
        amount: statement.closingBalance,
        partyName: party.name,
        phone: party.phone,
        email: party.email,
        description: `Account balance — ${companyName}`,
      });
      if (link.ok) payNowUrl = link.shortUrl;
    }
  }

  const buffer = await renderStatementPdf({
    company: {
      name: companyName,
      gstNumber: settings?.companyGstNumber ?? null,
      address: settings?.companyAddress ?? null,
      cityPin: settings?.companyCityPin ?? null,
      state: settings?.companyState ?? null,
      logo: settings?.companyLogoPath ? await downloadLogoBytes(settings.companyLogoPath) : null,
    },
    customer: {
      name: party.name,
      gstNumber: party.gstNumber,
      address: party.address,
      city: party.city,
      state: party.state,
    },
    period: `${formatDate(from)} to ${formatDate(to)}`,
    generatedOn: formatDate(to),
    openingBalance: rs(statement.openingBalance),
    rows: statement.rows.map((r) => ({
      date: formatDate(r.date),
      ref: r.ref,
      detail: r.detail,
      debit: rsOrBlank(r.debit),
      credit: rsOrBlank(r.credit),
      balance: rs(r.balance),
    })),
    totalDebits: rs(statement.totalDebits),
    totalCredits: rs(statement.totalCredits),
    closingBalance: rs(statement.closingBalance),
    ageing: AGING_BUCKETS.map((b) => ({ label: AGING_LABELS[b], amount: rs(statement.ageing[b]) })),
    overdue: rs(statement.overdue),
    payNowUrl,
    bank:
      settings && (settings.bankAccountNumber || settings.bankAccountName)
        ? {
            accountName: settings.bankAccountName,
            accountNumber: settings.bankAccountNumber ? decryptSecret(settings.bankAccountNumber) : null,
            ifscCode: settings.bankIfscCode,
            bankName: settings.bankName,
            branch: settings.bankBranch,
          }
        : null,
  });

  return {
    filename: `Statement-${party.name.replace(/[^\w.-]+/g, "_").slice(0, 60)}.pdf`,
    buffer,
    closingBalance: statement.closingBalance,
  };
}
