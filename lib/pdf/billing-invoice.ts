// SERVER-ONLY — GST tax invoice for a Syncit subscription charge.
//
// Seller = Syncit's legal entity, from env (BILLING_LEGAL_NAME,
// BILLING_GSTIN, BILLING_ADDRESS, BILLING_STATE, BILLING_CITY_PIN).
// Buyer = the Organization, snapshotted onto BillingInvoice when the
// charge landed. Reuses the shared company-doc template.

import type { BillingInvoice } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { GST_RATE, SAC_CODE, getPlan, planIdFromOrgPlan } from "@/lib/plans";
import { renderCompanyDoc, type CompanyDocData } from "./company-doc";

/** Helvetica has no ₹ glyph — PDF amounts use "Rs." (UI keeps ₹). */
function rs(paise: number): string {
  return (
    "Rs. " +
    (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

// Syncit's place of business. CGST + SGST when the buyer is in the same
// state, IGST otherwise. With no buyer state on file the place of supply
// is the supplier's location (IGST Act s.10(1)), so it's intra-state.
const DEFAULT_SELLER_STATE = "Maharashtra";

function normState(v: string): string {
  return v.trim().toLowerCase().replace(/^\d{2}\s*-\s*/, ""); // "27 - Maharashtra"
}

function sameState(seller: string, buyer: string | null): boolean {
  if (!buyer || !buyer.trim()) return true;
  return normState(seller) === normState(buyer);
}

export async function renderBillingInvoicePdf(inv: BillingInvoice): Promise<Buffer> {
  const sellerState = process.env.BILLING_STATE?.trim() || DEFAULT_SELLER_STATE;
  const plan = getPlan(planIdFromOrgPlan(inv.plan) ?? "starter");
  const period =
    inv.periodStart && inv.periodEnd
      ? ` (${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)})`
      : "";

  const intra = sameState(sellerState, inv.customerState);
  const tax: CompanyDocData["tax"] = intra
    ? {
        split: "CGST_SGST",
        cgst: rs(Math.floor(inv.gstPaise / 2)),
        sgst: rs(inv.gstPaise - Math.floor(inv.gstPaise / 2)),
      }
    : { split: "IGST", igst: rs(inv.gstPaise) };

  return renderCompanyDoc({
    heading: "TAX INVOICE",
    number: inv.invoiceNumber,
    dates: [
      { label: "Invoice date", value: formatDate(inv.issuedAt) },
      { label: "Payment ref", value: inv.razorpayPaymentId },
    ],
    company: {
      name: process.env.BILLING_LEGAL_NAME ?? "Syncit",
      gstNumber: process.env.BILLING_GSTIN ?? null,
      address: process.env.BILLING_ADDRESS ?? null,
      state: sellerState,
      cityPin: process.env.BILLING_CITY_PIN ?? null,
      logo: null,
    },
    billTo: {
      name: inv.customerName,
      gstNumber: inv.customerGstin,
      address: null,
      city: null,
      state: inv.customerState,
    },
    lines: [
      {
        description: `Syncit ${plan.name} subscription, ${inv.billingCycle}${period} — SAC ${SAC_CODE}`,
        quantity: "1",
        unit: null,
        unitPrice: rs(inv.taxablePaise),
        taxRate: `${Math.round(GST_RATE * 100)}%`,
        lineTotal: rs(inv.taxablePaise),
      },
    ],
    subtotal: rs(inv.taxablePaise),
    tax,
    total: rs(inv.totalPaise),
    bank: null,
    terms: "Paid in full via Razorpay. This is a computer-generated invoice.",
    signatoryName: process.env.BILLING_SIGNATORY_NAME ?? null,
  });
}
