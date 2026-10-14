import { describe, expect, it } from "vitest";
import { renderStatementPdf, type StatementPdfData } from "../statement";

const data: StatementPdfData = {
  company: { name: "Acme Traders", gstNumber: "27ABCDE1234F1Z5", address: "Plot 4, MIDC", cityPin: "Pune 411026", state: "Maharashtra", logo: null },
  customer: { name: "Shree Hardware & Co", gstNumber: null, address: "Timber Market", city: "Pune", state: "Maharashtra" },
  period: "7 Oct 2025 to 7 Oct 2026",
  generatedOn: "7 Oct 2026",
  openingBalance: "Rs. 12,000.00",
  rows: Array.from({ length: 60 }, (_, i) => ({
    date: "1 Sep 2026",
    ref: `INV-${i}`,
    detail: "Invoice",
    debit: "Rs. 1,000.00",
    credit: "",
    balance: "Rs. 13,000.00",
  })),
  totalDebits: "Rs. 60,000.00",
  totalCredits: "Rs. 0.00",
  closingBalance: "Rs. 72,000.00",
  ageing: [{ label: "Not yet due", amount: "Rs. 0.00" }, { label: "0–30 days", amount: "Rs. 72,000.00" }],
  overdue: "Rs. 72,000.00",
  payNowUrl: "https://rzp.io/i/abc123",
  bank: { accountName: "Acme Traders", accountNumber: "1234567890", ifscCode: "HDFC0000123", bankName: "HDFC Bank", branch: "Bhosari" },
};

describe("statement PDF", () => {
  it("renders a multi-page PDF, with and without a Pay now link", async () => {
    const withLink = await renderStatementPdf(data);
    expect(withLink.subarray(0, 5).toString()).toBe("%PDF-");
    expect(withLink.length).toBeGreaterThan(3000);
    // The link target is stored as a plain URI annotation.
    expect(withLink.toString("latin1")).toContain("rzp.io/i/abc123");

    const without = await renderStatementPdf({ ...data, payNowUrl: null, bank: null, rows: [] });
    expect(without.subarray(0, 5).toString()).toBe("%PDF-");
    expect(without.toString("latin1")).not.toContain("rzp.io");
  }, 30_000);
});
