import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { msmeDueDate, type MsmeInput } from "../tools/msme";
import { calculateDso } from "../tools/dso";
import { buildAgeingTemplate } from "../tools/ageing-template";

const base: MsmeInput = {
  acceptanceDate: "2026-01-10",
  hasWrittenAgreement: true,
  agreedDays: 45,
  amount: 1000000,
  paymentDate: null,
  taxRatePct: 25,
  today: "2026-02-01",
};

describe("43B(h) due date", () => {
  it("uses the agreed period, capped at 45 days, or 15 days with no agreement", () => {
    expect(msmeDueDate(base)).toMatchObject({ limitDays: 45, capped: false, dueDate: "2026-02-24" });
    expect(msmeDueDate({ ...base, agreedDays: 30 })).toMatchObject({ limitDays: 30, dueDate: "2026-02-09" });
    expect(msmeDueDate({ ...base, agreedDays: 60 })).toMatchObject({ limitDays: 45, capped: true, dueDate: "2026-02-24" });
    expect(msmeDueDate({ ...base, hasWrittenAgreement: false })).toMatchObject({ limitDays: 15, dueDate: "2026-01-25" });
  });

  it("puts the purchase in the right financial year", () => {
    expect(msmeDueDate(base)).toMatchObject({ financialYear: "2025-26", yearEnd: "2026-03-31" });
    expect(msmeDueDate({ ...base, acceptanceDate: "2026-04-01" })).toMatchObject({ financialYear: "2026-27", yearEnd: "2027-03-31" });
  });

  it("paid within the limit: nothing disallowed", () => {
    const r = msmeDueDate({ ...base, paymentDate: "2026-02-24" });
    expect(r).toMatchObject({ status: "paid_on_time", daysLate: 0, disallowedThisYear: 0, estimatedTax: 0 });
  });

  it("paid late but before 31 March: still deductible this year", () => {
    const r = msmeDueDate({ ...base, paymentDate: "2026-03-20" });
    expect(r).toMatchObject({ status: "paid_late_same_year", daysLate: 24, disallowedThisYear: 0 });
  });

  it("paid after 31 March: disallowed this year, tax estimated", () => {
    const r = msmeDueDate({ ...base, paymentDate: "2026-04-15" });
    expect(r).toMatchObject({ status: "paid_after_year_end", disallowedThisYear: 1000000, estimatedTax: 250000 });
  });

  it("a March invoice paid within its limit in April is fine", () => {
    const r = msmeDueDate({ ...base, acceptanceDate: "2026-03-01", paymentDate: "2026-04-10" });
    expect(r).toMatchObject({ dueDate: "2026-04-15", status: "paid_on_time", disallowedThisYear: 0 });
  });

  it("unpaid: tells you the date that keeps the deduction", () => {
    expect(msmeDueDate(base)).toMatchObject({ status: "unpaid_not_yet_due", payByToAvoid: "2026-02-24", disallowedThisYear: 0 });
    expect(msmeDueDate({ ...base, today: "2026-03-10" })).toMatchObject({
      status: "unpaid_overdue", daysLate: 14, payByToAvoid: "2026-03-31", disallowedThisYear: 1000000,
    });
    expect(msmeDueDate({ ...base, today: "2026-05-01" })).toMatchObject({ status: "unpaid_overdue", payByToAvoid: null });
  });
});

describe("DSO", () => {
  it("matches the worked example in the blog post", () => {
    const r = calculateDso({ receivables: 24000000, creditSales: 120000000, periodDays: 365, termsDays: 45, financeRatePct: 11 })!;
    expect(r.dso).toBe(73);
    expect(r.daysBeyondTerms).toBe(28);
    expect(r.cashTiedUp).toBeGreaterThan(9100000);
    expect(r.cashTiedUp).toBeLessThan(9300000);
    expect(r.annualFinanceCost).toBe(Math.round((r.cashTiedUp * 11) / 100));
  });

  it("paying early ties up nothing; bad input gives no answer", () => {
    const r = calculateDso({ receivables: 1000000, creditSales: 12000000, periodDays: 365, termsDays: 45, financeRatePct: 11 })!;
    expect(r.daysBeyondTerms).toBeLessThan(0);
    expect(r.cashTiedUp).toBe(0);
    expect(calculateDso({ receivables: 1, creditSales: 0, periodDays: 365, termsDays: 30, financeRatePct: 10 })).toBeNull();
  });
});

describe("ageing template", () => {
  it("is a valid .xlsx archive with three sheets and live formulas", () => {
    const buf = buildAgeingTemplate(new Date(2026, 9, 9));
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const file = join(mkdtempSync(join(tmpdir(), "syncit-xlsx-")), "t.xlsx");
    writeFileSync(file, buf);
    // `unzip -t` verifies every entry's CRC.
    const listing = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
    expect(listing).toContain("No errors detected");
    for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet3.xml"]) {
      expect(listing).toContain(part);
    }
    const sheet1 = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
    expect(sheet1).toContain("TODAY()-D2");
    expect(sheet1).toContain("Over 90 days");
    const workbook = execFileSync("unzip", ["-p", file, "xl/workbook.xml"], { encoding: "utf8" });
    expect(workbook).toContain('name="Invoices"');
    expect(workbook).toContain('name="Summary"');
  });
});
