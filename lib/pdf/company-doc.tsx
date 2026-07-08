// SERVER-ONLY — shared print-ready PDF template for proforma invoices and
// tax invoices (@react-pdf/renderer; chosen over Puppeteer/Chromium which
// is too heavy for a serverless deploy target).
//
// Note: the built-in Helvetica font has no ₹ glyph, so amounts render as
// "Rs." here (the app UI keeps ₹).

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

export type PdfLineItem = {
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string; // pre-formatted numbers — Decimal never crosses in
  taxRate: string;
  lineTotal: string;
};

export type CompanyDocData = {
  /** Document header, e.g. "PROFORMA INVOICE" or "TAX INVOICE". */
  heading: string;
  number: string;
  dates: { label: string; value: string }[];
  company: {
    name: string;
    gstNumber: string | null;
    address: string | null;
    state: string | null;
    cityPin: string | null;
    /** Raw image bytes (png/jpg); SVG logos are skipped. */
    logo: { bytes: Buffer; contentType: string } | null;
  };
  billTo: {
    name: string;
    gstNumber: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  lines: PdfLineItem[];
  subtotal: string;
  /**
   * Intra-state (company state == party state) splits tax into CGST+SGST;
   * inter-state shows IGST. When either state is missing we show a single
   * "Tax" line. This inference is an assumption — flag to users in docs.
   */
  tax:
    | { split: "CGST_SGST"; cgst: string; sgst: string }
    | { split: "IGST"; igst: string }
    | { split: "NONE"; tax: string };
  total: string;
  bank: {
    accountName: string | null;
    accountNumber: string | null; // decrypted server-side just for this render
    ifscCode: string | null;
    bankName: string | null;
    branch: string | null;
  } | null;
  terms: string | null;
  signatoryName: string | null;
};

const s = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  logo: { width: 90, height: 54, objectFit: "contain" },
  companyBlock: { alignItems: "flex-end", maxWidth: 260 },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  heading: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "1 solid #e5e7eb",
    borderBottom: "1 solid #e5e7eb",
    paddingVertical: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  table: { marginBottom: 12 },
  tr: { flexDirection: "row", borderBottom: "1 solid #f3f4f6", paddingVertical: 5 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#374151" },
  cDesc: { flex: 4, paddingRight: 6 },
  cQty: { flex: 1.2, textAlign: "right" },
  cPrice: { flex: 1.6, textAlign: "right" },
  cTax: { flex: 1, textAlign: "right" },
  cTotal: { flex: 1.8, textAlign: "right" },
  totalsBlock: { alignSelf: "flex-end", width: 200, marginBottom: 16 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandTotal: {
    borderTop: "1 solid #111827",
    marginTop: 3,
    paddingTop: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  bankBox: {
    border: "1 solid #e5e7eb",
    borderRadius: 4,
    padding: 8,
    width: 250,
  },
  signBlock: { alignItems: "flex-end", justifyContent: "flex-end", width: 200 },
  signLine: { borderTop: "1 solid #9ca3af", width: 160, marginTop: 40, paddingTop: 4 },
  terms: { marginTop: 14, maxWidth: 400 },
});

function logoDataUri(logo: { bytes: Buffer; contentType: string }): string {
  return `data:${logo.contentType};base64,${logo.bytes.toString("base64")}`;
}

export function CompanyDoc({ data }: { data: CompanyDocData }) {
  return (
    <Document title={`${data.heading} ${data.number}`}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            {data.company.logo ? (
              <Image style={s.logo} src={logoDataUri(data.company.logo)} />
            ) : (
              <Text style={s.companyName}>{data.company.name}</Text>
            )}
          </View>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{data.company.name}</Text>
            {data.company.gstNumber && (
              <Text style={s.muted}>GSTIN: {data.company.gstNumber}</Text>
            )}
            {data.company.address && <Text style={s.muted}>{data.company.address}</Text>}
            {(data.company.cityPin || data.company.state) && (
              <Text style={s.muted}>
                {[data.company.cityPin, data.company.state].filter(Boolean).join(", ")}
              </Text>
            )}
          </View>
        </View>

        <Text style={s.heading}>{data.heading}</Text>

        <View style={s.metaRow}>
          <View>
            <Text style={s.sectionTitle}>Number</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.number}</Text>
          </View>
          {data.dates.map((d) => (
            <View key={d.label}>
              <Text style={s.sectionTitle}>{d.label}</Text>
              <Text>{d.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginBottom: 14 }}>
          <Text style={s.sectionTitle}>Bill to</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>
            {data.billTo.name}
          </Text>
          {data.billTo.gstNumber && (
            <Text style={s.muted}>GSTIN: {data.billTo.gstNumber}</Text>
          )}
          {data.billTo.address && <Text style={s.muted}>{data.billTo.address}</Text>}
          {(data.billTo.city || data.billTo.state) && (
            <Text style={s.muted}>
              {[data.billTo.city, data.billTo.state].filter(Boolean).join(", ")}
            </Text>
          )}
        </View>

        <View style={s.table}>
          <View style={[s.tr, { borderBottom: "1 solid #d1d5db" }]}>
            <Text style={[s.cDesc, s.th]}>Description</Text>
            <Text style={[s.cQty, s.th]}>Qty</Text>
            <Text style={[s.cPrice, s.th]}>Unit price</Text>
            <Text style={[s.cTax, s.th]}>Tax %</Text>
            <Text style={[s.cTotal, s.th]}>Amount</Text>
          </View>
          {data.lines.map((li, i) => (
            <View key={i} style={s.tr}>
              <Text style={s.cDesc}>{li.description}</Text>
              <Text style={s.cQty}>
                {li.quantity}
                {li.unit ? ` ${li.unit}` : ""}
              </Text>
              <Text style={s.cPrice}>{li.unitPrice}</Text>
              <Text style={s.cTax}>{li.taxRate}</Text>
              <Text style={s.cTotal}>{li.lineTotal}</Text>
            </View>
          ))}
        </View>

        <View style={s.totalsBlock}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{data.subtotal}</Text>
          </View>
          {data.tax.split === "CGST_SGST" && (
            <>
              <View style={s.totalRow}>
                <Text style={s.muted}>CGST</Text>
                <Text>{data.tax.cgst}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.muted}>SGST</Text>
                <Text>{data.tax.sgst}</Text>
              </View>
            </>
          )}
          {data.tax.split === "IGST" && (
            <View style={s.totalRow}>
              <Text style={s.muted}>IGST</Text>
              <Text>{data.tax.igst}</Text>
            </View>
          )}
          {data.tax.split === "NONE" && (
            <View style={s.totalRow}>
              <Text style={s.muted}>Tax</Text>
              <Text>{data.tax.tax}</Text>
            </View>
          )}
          <View style={[s.totalRow, s.grandTotal]}>
            <Text>Total</Text>
            <Text>{data.total}</Text>
          </View>
        </View>

        <View style={s.bottomRow}>
          {data.bank &&
          (data.bank.accountNumber || data.bank.accountName || data.bank.ifscCode) ? (
            <View style={s.bankBox}>
              <Text style={s.sectionTitle}>Pay by NEFT / RTGS</Text>
              {data.bank.accountName && (
                <Text>Account name: {data.bank.accountName}</Text>
              )}
              {data.bank.accountNumber && (
                <Text>Account number: {data.bank.accountNumber}</Text>
              )}
              {data.bank.ifscCode && <Text>IFSC: {data.bank.ifscCode}</Text>}
              {(data.bank.bankName || data.bank.branch) && (
                <Text>
                  {[data.bank.bankName, data.bank.branch].filter(Boolean).join(", ")}
                </Text>
              )}
            </View>
          ) : (
            <View />
          )}
          <View style={s.signBlock}>
            <Text style={s.muted}>For {data.company.name}</Text>
            <View style={s.signLine}>
              <Text style={{ textAlign: "center" }}>
                {data.signatoryName ?? "Authorized signatory"}
              </Text>
            </View>
          </View>
        </View>

        {data.terms && (
          <View style={s.terms}>
            <Text style={s.sectionTitle}>Terms & conditions</Text>
            <Text style={s.muted}>{data.terms}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderCompanyDoc(data: CompanyDocData): Promise<Buffer> {
  return renderToBuffer(<CompanyDoc data={data} />);
}
