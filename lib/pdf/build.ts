// SERVER-ONLY — loads a proforma/invoice with company settings and renders
// the shared PDF template. The decrypted bank account number exists only
// inside this render call and the resulting PDF bytes.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { formatDate, toNumber } from "@/lib/format";
import { downloadLogoBytes } from "@/lib/storage";
import {
  renderCompanyDoc,
  type CompanyDocData,
  type PdfLineItem,
} from "./company-doc";

type Numeric = Prisma.Decimal | number;

/** Helvetica has no ₹ glyph — PDF amounts use "Rs." (UI keeps ₹). */
function rs(v: Numeric): string {
  return (
    "Rs. " +
    toNumber(v).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function qty(v: Prisma.Decimal): string {
  return toNumber(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

type SettingsRow = NonNullable<
  Prisma.PromiseReturnType<typeof db.businessSettings.findFirst>
>;

async function companyBlock(settings: SettingsRow, businessName: string) {
  return {
    name: businessName,
    gstNumber: settings.companyGstNumber,
    address: settings.companyAddress,
    state: settings.companyState,
    cityPin: settings.companyCityPin,
    logo: settings.companyLogoPath
      ? await downloadLogoBytes(settings.companyLogoPath)
      : null,
  };
}

function bankBlock(settings: SettingsRow): CompanyDocData["bank"] {
  if (!settings.bankAccountNumber && !settings.bankAccountName) return null;
  return {
    accountName: settings.bankAccountName,
    accountNumber: settings.bankAccountNumber
      ? decryptSecret(settings.bankAccountNumber)
      : null,
    ifscCode: settings.bankIfscCode,
    bankName: settings.bankName,
    branch: settings.bankBranch,
  };
}

/**
 * Intra vs inter-state GST split inferred from companyState vs the party's
 * state (case-insensitive). ASSUMPTION: state names are entered
 * consistently on both sides; when either is missing we show one combined
 * "Tax" line instead of guessing.
 */
function taxBlock(
  taxAmount: Prisma.Decimal,
  companyState: string | null,
  partyState: string | null
): CompanyDocData["tax"] {
  const norm = (v: string | null) => v?.trim().toLowerCase() ?? null;
  const cs = norm(companyState);
  const ps = norm(partyState);
  if (!cs || !ps) return { split: "NONE", tax: rs(taxAmount) };
  if (cs === ps) {
    const half = taxAmount.dividedBy(2).toDecimalPlaces(2);
    return { split: "CGST_SGST", cgst: rs(half), sgst: rs(taxAmount.minus(half)) };
  }
  return { split: "IGST", igst: rs(taxAmount) };
}

async function adminBusinessName(): Promise<string> {
  return (
    (await db.profile.findFirst({ where: { role: "ADMIN" } }))?.businessName ??
    "Your supplier"
  );
}

export async function buildProformaPdf(
  proformaId: string
): Promise<{ filename: string; buffer: Buffer; partyId: string } | { error: string }> {
  const [proforma, settings, businessName] = await Promise.all([
    db.proformaInvoice.findUnique({
      where: { id: proformaId },
      include: { party: true, lineItems: { orderBy: { sortOrder: "asc" } } },
    }),
    db.businessSettings.findFirst(),
    adminBusinessName(),
  ]);
  if (!proforma) return { error: "Proforma not found" };
  if (!settings) return { error: "Business settings missing" };

  const lines: PdfLineItem[] = proforma.lineItems.map((li) => ({
    description: li.description,
    quantity: qty(li.quantity),
    unit: li.unit,
    unitPrice: rs(li.unitPrice),
    taxRate: `${toNumber(li.taxRate)}%`,
    lineTotal: rs(li.lineTotal),
  }));

  const dates = [{ label: "Issue date", value: formatDate(proforma.issueDate) }];
  if (proforma.validUntil) {
    dates.push({ label: "Valid until", value: formatDate(proforma.validUntil) });
  }

  const buffer = await renderCompanyDoc({
    heading: "PROFORMA INVOICE",
    number: proforma.proformaNumber,
    dates,
    company: await companyBlock(settings, businessName),
    billTo: {
      name: proforma.party.name,
      gstNumber: proforma.party.gstNumber,
      address: proforma.party.address,
      city: proforma.party.city,
      state: proforma.party.state,
    },
    lines,
    subtotal: rs(proforma.subtotal),
    tax: taxBlock(proforma.taxAmount, settings.companyState, proforma.party.state),
    total: rs(proforma.totalAmount),
    bank: bankBlock(settings),
    terms: proforma.termsConditions,
    signatoryName: settings.authorizedSignatoryName,
  });

  return {
    filename: `${proforma.proformaNumber}.pdf`,
    buffer,
    partyId: proforma.partyId,
  };
}

export async function buildInvoicePdf(
  invoiceId: string
): Promise<{ filename: string; buffer: Buffer; partyId: string } | { error: string }> {
  const [invoice, settings, businessName] = await Promise.all([
    db.invoice.findUnique({ where: { id: invoiceId }, include: { party: true } }),
    db.businessSettings.findFirst(),
    adminBusinessName(),
  ]);
  if (!invoice) return { error: "Invoice not found" };
  if (!settings) return { error: "Business settings missing" };

  // Invoices carry a single total (no line-item model) — render one line.
  // Invoices converted from a proforma keep the itemised breakdown in notes.
  const lines: PdfLineItem[] = [
    {
      description: invoice.notes?.startsWith("Converted from proforma")
        ? invoice.notes
        : `Goods/services as per invoice ${invoice.invoiceNumber}`,
      quantity: "1",
      unit: null,
      unitPrice: rs(invoice.totalAmount),
      taxRate: "—",
      lineTotal: rs(invoice.totalAmount),
    },
  ];

  const buffer = await renderCompanyDoc({
    heading: settings.companyGstNumber ? "TAX INVOICE" : "INVOICE",
    number: invoice.invoiceNumber,
    dates: [
      { label: "Invoice date", value: formatDate(invoice.invoiceDate) },
      { label: "Due date", value: formatDate(invoice.dueDate) },
    ],
    company: await companyBlock(settings, businessName),
    billTo: {
      name: invoice.party.name,
      gstNumber: invoice.party.gstNumber,
      address: invoice.party.address,
      city: invoice.party.city,
      state: invoice.party.state,
    },
    lines,
    subtotal: rs(invoice.totalAmount),
    // Tax is not tracked separately on invoices — totals are tax-inclusive.
    tax: { split: "NONE", tax: rs(0) },
    total: rs(invoice.totalAmount),
    bank: bankBlock(settings),
    terms: null,
    signatoryName: settings.authorizedSignatoryName,
  });

  return {
    filename: `${invoice.invoiceNumber.replace(/[^\w.-]+/g, "_")}.pdf`,
    buffer,
    partyId: invoice.partyId,
  };
}
