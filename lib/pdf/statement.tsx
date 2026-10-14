// SERVER-ONLY — statement-of-account PDF (@react-pdf/renderer), in the
// same visual language as the invoice template (company-doc.tsx).
// Helvetica has no ₹ glyph, so amounts print as "Rs.".

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

export type StatementPdfData = {
  company: {
    name: string;
    gstNumber: string | null;
    address: string | null;
    cityPin: string | null;
    state: string | null;
    logo: { bytes: Buffer; contentType: string } | null;
  };
  customer: {
    name: string;
    gstNumber: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  period: string;
  generatedOn: string;
  openingBalance: string;
  rows: { date: string; ref: string; detail: string; debit: string; credit: string; balance: string }[];
  totalDebits: string;
  totalCredits: string;
  closingBalance: string;
  ageing: { label: string; amount: string }[];
  overdue: string;
  /** Razorpay link for the closing balance; null when the company has
   *  no Razorpay keys or nothing is owed. */
  payNowUrl: string | null;
  bank: {
    accountName: string | null;
    accountNumber: string | null;
    ifscCode: string | null;
    bankName: string | null;
    branch: string | null;
  } | null;
};

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  logo: { width: 90, height: 54, objectFit: "contain" },
  companyBlock: { alignItems: "flex-end", maxWidth: 260 },
  companyName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  heading: { fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, marginBottom: 4 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "1 solid #e5e7eb",
    borderBottom: "1 solid #e5e7eb",
    paddingVertical: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  tr: { flexDirection: "row", borderBottom: "1 solid #f3f4f6", paddingVertical: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#374151" },
  bold: { fontFamily: "Helvetica-Bold" },
  cDate: { width: 62 },
  cRef: { width: 92, paddingRight: 4 },
  cDetail: { flex: 1, paddingRight: 4 },
  cNum: { width: 78, textAlign: "right" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  box: { border: "1 solid #e5e7eb", borderRadius: 4, padding: 8, width: 250 },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  closing: {
    borderTop: "1 solid #111827",
    marginTop: 3,
    paddingTop: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  payBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 4,
    backgroundColor: "#ecfdf5",
    border: "1 solid #a7f3d0",
  },
  payLink: { color: "#065f46", fontFamily: "Helvetica-Bold", fontSize: 11 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: "#9ca3af" },
});

function StatementDoc({ data }: { data: StatementPdfData }) {
  const { company, customer } = data;
  return (
    <Document title={`Statement of account — ${customer.name}`} author={company.name}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.headerRow}>
          <View>
            {company.logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
              <Image
                style={s.logo}
                src={`data:${company.logo.contentType};base64,${company.logo.bytes.toString("base64")}`}
              />
            ) : null}
            <Text style={[s.heading, { marginTop: company.logo ? 8 : 0 }]}>STATEMENT OF ACCOUNT</Text>
            <Text style={s.muted}>{data.period}</Text>
          </View>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{company.name}</Text>
            {company.address ? <Text style={s.muted}>{company.address}</Text> : null}
            {company.cityPin || company.state ? (
              <Text style={s.muted}>{[company.cityPin, company.state].filter(Boolean).join(", ")}</Text>
            ) : null}
            {company.gstNumber ? <Text style={s.muted}>GSTIN: {company.gstNumber}</Text> : null}
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={{ maxWidth: 300 }}>
            <Text style={s.sectionTitle}>Statement for</Text>
            <Text style={s.bold}>{customer.name}</Text>
            {customer.address ? <Text style={s.muted}>{customer.address}</Text> : null}
            {customer.city || customer.state ? (
              <Text style={s.muted}>{[customer.city, customer.state].filter(Boolean).join(", ")}</Text>
            ) : null}
            {customer.gstNumber ? <Text style={s.muted}>GSTIN: {customer.gstNumber}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.sectionTitle}>Balance due</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{data.closingBalance}</Text>
            <Text style={s.muted}>as on {data.generatedOn}</Text>
          </View>
        </View>

        <View style={s.tr} fixed>
          <Text style={[s.th, s.cDate]}>Date</Text>
          <Text style={[s.th, s.cRef]}>Reference</Text>
          <Text style={[s.th, s.cDetail]}>Particulars</Text>
          <Text style={[s.th, s.cNum]}>Debit</Text>
          <Text style={[s.th, s.cNum]}>Credit</Text>
          <Text style={[s.th, s.cNum]}>Balance</Text>
        </View>
        <View style={s.tr}>
          <Text style={s.cDate} />
          <Text style={s.cRef} />
          <Text style={[s.cDetail, s.bold]}>Opening balance</Text>
          <Text style={s.cNum} />
          <Text style={s.cNum} />
          <Text style={[s.cNum, s.bold]}>{data.openingBalance}</Text>
        </View>
        {data.rows.map((r, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.cDate}>{r.date}</Text>
            <Text style={s.cRef}>{r.ref}</Text>
            <Text style={s.cDetail}>{r.detail}</Text>
            <Text style={s.cNum}>{r.debit}</Text>
            <Text style={s.cNum}>{r.credit}</Text>
            <Text style={s.cNum}>{r.balance}</Text>
          </View>
        ))}
        {data.rows.length === 0 ? (
          <View style={s.tr}>
            <Text style={[s.cDetail, s.muted]}>No transactions in this period.</Text>
          </View>
        ) : null}
        <View style={[s.tr, { borderBottom: "1 solid #111827" }]} wrap={false}>
          <Text style={s.cDate} />
          <Text style={s.cRef} />
          <Text style={[s.cDetail, s.bold]}>Total</Text>
          <Text style={[s.cNum, s.bold]}>{data.totalDebits}</Text>
          <Text style={[s.cNum, s.bold]}>{data.totalCredits}</Text>
          <Text style={[s.cNum, s.bold]}>{data.closingBalance}</Text>
        </View>

        <View style={s.summaryRow} wrap={false}>
          <View style={s.box}>
            <Text style={s.sectionTitle}>Ageing of unpaid invoices</Text>
            {data.ageing.map((a) => (
              <View key={a.label} style={s.kv}>
                <Text>{a.label}</Text>
                <Text>{a.amount}</Text>
              </View>
            ))}
            <View style={[s.kv, s.closing]}>
              <Text>Past due</Text>
              <Text>{data.overdue}</Text>
            </View>
          </View>
          {data.bank ? (
            <View style={s.box}>
              <Text style={s.sectionTitle}>Pay by bank transfer</Text>
              {data.bank.accountName ? <Text>{data.bank.accountName}</Text> : null}
              {data.bank.accountNumber ? <Text>A/c: {data.bank.accountNumber}</Text> : null}
              {data.bank.ifscCode ? <Text>IFSC: {data.bank.ifscCode}</Text> : null}
              {data.bank.bankName ? (
                <Text style={s.muted}>
                  {[data.bank.bankName, data.bank.branch].filter(Boolean).join(", ")}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {data.payNowUrl ? (
          <View style={s.payBox} wrap={false}>
            <Text style={s.sectionTitle}>Pay now — UPI, cards, net banking</Text>
            <Link src={data.payNowUrl} style={s.payLink}>
              {data.payNowUrl}
            </Link>
            <Text style={[s.muted, { marginTop: 3 }]}>
              Tap or type the link to pay {data.closingBalance}. Part payments are accepted.
            </Text>
          </View>
        ) : null}

        <Text style={s.footer} fixed>
          Computer-generated statement from {company.name}. Please report any difference within 7 days.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderStatementPdf(data: StatementPdfData): Promise<Buffer> {
  return renderToBuffer(<StatementDoc data={data} />);
}
