// SERVER-ONLY — pulls contacts + open invoices from a connected cloud
// accounting provider and maps them into the CSV-import row shape, then
// runs them through lib/import/ingest.ts (same validation, same dedupe).
// tallyRef doubles as the cross-system dedupe key: "zoho:contact:123".

import type { AccountingProvider } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ingestPartyRows,
  ingestInvoiceRows,
  type ImportResult,
} from "@/lib/import/ingest";
import { getAccessToken, PROVIDER_LABELS, ZOHO_API_BASE } from "./accounting";

type Row = Record<string, string>;
type PulledRows = { parties: Row[]; invoices: Row[] } | { error: string };

const iso = (v: string | undefined | null) => (v ?? "").slice(0, 10);

// ── Zoho Books ──────────────────────────────────────────────────────

async function pullZoho(token: string, orgId: string): Promise<PulledRows> {
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };
  const base = `${ZOHO_API_BASE}/books/v3`;

  const contactsRes = await fetch(
    `${base}/contacts?organization_id=${orgId}&contact_type=customer&per_page=200`,
    { headers }
  );
  const contactsData = (await contactsRes.json()) as {
    contacts?: Record<string, string>[];
    message?: string;
  };
  if (!contactsRes.ok || !contactsData.contacts) {
    return { error: `Zoho Books contacts: ${contactsData.message ?? contactsRes.status}` };
  }

  const invoicesRes = await fetch(
    `${base}/invoices?organization_id=${orgId}&status=unpaid&per_page=200`,
    { headers }
  );
  const invoicesData = (await invoicesRes.json()) as {
    invoices?: Record<string, string>[];
    message?: string;
  };
  if (!invoicesRes.ok || !invoicesData.invoices) {
    return { error: `Zoho Books invoices: ${invoicesData.message ?? invoicesRes.status}` };
  }

  return {
    parties: contactsData.contacts.map((c) => ({
      name: c.contact_name ?? "",
      gstNumber: c.gst_no ?? "",
      phone: c.phone ?? c.mobile ?? "",
      email: c.email ?? "",
      tallyRef: `zoho:contact:${c.contact_id}`,
    })),
    invoices: invoicesData.invoices.map((inv) => ({
      partyName: inv.customer_name ?? "",
      invoiceNumber: inv.invoice_number ?? "",
      invoiceDate: iso(inv.date),
      dueDate: iso(inv.due_date) || iso(inv.date),
      totalAmount: String(inv.total ?? ""),
      tallyRef: `zoho:invoice:${inv.invoice_id}`,
    })),
  };
}

// ── QuickBooks Online ───────────────────────────────────────────────

async function pullQuickBooks(token: string, realmId: string): Promise<PulledRows> {
  const base =
    (process.env.QUICKBOOKS_API_BASE ?? "https://quickbooks.api.intuit.com") +
    `/v3/company/${realmId}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const query = (q: string) =>
    fetch(`${base}/query?query=${encodeURIComponent(q)}`, { headers });

  const custRes = await query("select * from Customer maxresults 1000");
  const custData = (await custRes.json()) as {
    QueryResponse?: { Customer?: Record<string, any>[] };
    Fault?: { Error?: { Message?: string }[] };
  };
  if (!custRes.ok) {
    return {
      error: `QuickBooks customers: ${custData.Fault?.Error?.[0]?.Message ?? custRes.status}`,
    };
  }

  const invRes = await query(
    "select * from Invoice where Balance > '0' maxresults 1000"
  );
  const invData = (await invRes.json()) as {
    QueryResponse?: { Invoice?: Record<string, any>[] };
    Fault?: { Error?: { Message?: string }[] };
  };
  if (!invRes.ok) {
    return {
      error: `QuickBooks invoices: ${invData.Fault?.Error?.[0]?.Message ?? invRes.status}`,
    };
  }

  return {
    parties: (custData.QueryResponse?.Customer ?? []).map((c) => ({
      name: c.DisplayName ?? "",
      phone: c.PrimaryPhone?.FreeFormNumber ?? "",
      email: c.PrimaryEmailAddr?.Address ?? "",
      city: c.BillAddr?.City ?? "",
      state: c.BillAddr?.CountrySubDivisionCode ?? "",
      tallyRef: `qbo:customer:${c.Id}`,
    })),
    invoices: (invData.QueryResponse?.Invoice ?? []).map((inv) => ({
      partyName: inv.CustomerRef?.name ?? "",
      invoiceNumber: inv.DocNumber ?? `QBO-${inv.Id}`,
      invoiceDate: iso(inv.TxnDate),
      dueDate: iso(inv.DueDate) || iso(inv.TxnDate),
      totalAmount: String(inv.TotalAmt ?? ""),
      tallyRef: `qbo:invoice:${inv.Id}`,
    })),
  };
}

// ── Xero ────────────────────────────────────────────────────────────

async function pullXero(token: string, tenantId: string): Promise<PulledRows> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Xero-tenant-id": tenantId,
    Accept: "application/json",
  };
  const base = "https://api.xero.com/api.xro/2.0";

  const contactsRes = await fetch(`${base}/Contacts?where=IsCustomer==true`, {
    headers,
  });
  const contactsData = (await contactsRes.json()) as {
    Contacts?: Record<string, any>[];
    Detail?: string;
  };
  if (!contactsRes.ok) {
    return { error: `Xero contacts: ${contactsData.Detail ?? contactsRes.status}` };
  }

  const invoicesRes = await fetch(
    `${base}/Invoices?Statuses=AUTHORISED&where=${encodeURIComponent('Type=="ACCREC"')}`,
    { headers }
  );
  const invoicesData = (await invoicesRes.json()) as {
    Invoices?: Record<string, any>[];
    Detail?: string;
  };
  if (!invoicesRes.ok) {
    return { error: `Xero invoices: ${invoicesData.Detail ?? invoicesRes.status}` };
  }

  // Xero serialises dates as "/Date(1672531200000+0000)/"
  const xeroDate = (v: string | undefined) => {
    const ms = v?.match(/\d{10,}/)?.[0];
    return ms ? new Date(Number(ms)).toISOString().slice(0, 10) : "";
  };

  return {
    parties: (contactsData.Contacts ?? []).map((c) => ({
      name: c.Name ?? "",
      phone:
        c.Phones?.find((p: any) => p.PhoneType === "MOBILE")?.PhoneNumber ??
        c.Phones?.[0]?.PhoneNumber ??
        "",
      email: c.EmailAddress ?? "",
      tallyRef: `xero:contact:${c.ContactID}`,
    })),
    invoices: (invoicesData.Invoices ?? []).map((inv) => ({
      partyName: inv.Contact?.Name ?? "",
      invoiceNumber: inv.InvoiceNumber ?? `XERO-${(inv.InvoiceID ?? "").slice(0, 8)}`,
      invoiceDate: xeroDate(inv.Date),
      dueDate: xeroDate(inv.DueDate) || xeroDate(inv.Date),
      totalAmount: String(inv.Total ?? ""),
      tallyRef: `xero:invoice:${inv.InvoiceID}`,
    })),
  };
}

// ── Entry point ─────────────────────────────────────────────────────

export type SyncSummary = {
  parties: ImportResult;
  invoices: ImportResult;
};

export async function syncProvider(
  provider: AccountingProvider,
  triggeredById: string
): Promise<SyncSummary | { error: string }> {
  const access = await getAccessToken(provider);
  if ("error" in access) return access;
  if (!access.orgId) {
    return {
      error: `${PROVIDER_LABELS[provider]} organisation is unknown — reconnect from the Import page.`,
    };
  }

  let pulled: PulledRows;
  try {
    pulled =
      provider === "ZOHO_BOOKS"
        ? await pullZoho(access.token, access.orgId)
        : provider === "QUICKBOOKS"
          ? await pullQuickBooks(access.token, access.orgId)
          : await pullXero(access.token, access.orgId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Provider request failed" };
  }
  if ("error" in pulled) return pulled;

  const source = provider.toLowerCase();
  const parties = await ingestPartyRows(pulled.parties, { triggeredById, source });
  if ("error" in parties) return parties;
  const invoices = await ingestInvoiceRows(pulled.invoices, { triggeredById, source });
  if ("error" in invoices) return invoices;

  await db.accountingConnection.update({
    where: { provider },
    data: { lastSyncAt: new Date() },
  });

  return { parties, invoices };
}
