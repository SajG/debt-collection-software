import { buildXlsx, excelDate, STYLE, type Cell, type Sheet } from "./xlsx";

// The free "Outstanding ageing" workbook offered at
// /tools/outstanding-ageing-template. Three sheets:
//   Invoices  — type one row per unpaid bill; pending, days overdue and
//               the ageing bucket are formulas
//   Summary   — totals per bucket and per customer, from the first sheet
//   How to use
// Everything is live formulas (TODAY()), so the sheet ages by itself.

const DATA_ROWS = 300;
const BUCKETS = ["Not yet due", "0-30 days", "31-60 days", "61-90 days", "Over 90 days"];

const s = (v: string, style?: number): Cell => ({ t: "s", v, style });
const n = (v: number, style?: number): Cell => ({ t: "n", v, style });
const f = (v: string, style?: number): Cell => ({ t: "f", v, style });

export function buildAgeingTemplate(now: Date = new Date()): Buffer {
  const day = (offset: number) => excelDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));

  // Invented sample rows so the formulas show something on first open.
  const samples: [string, string, number, number, number, number, string][] = [
    ["Sample Hardware Stores", "INV-1001", -75, -45, 184500, 0, "Delete these sample rows"],
    ["Sample Hardware Stores", "INV-1042", -40, -10, 96200, 0, ""],
    ["Example Interiors", "INV-1017", -68, -38, 72800, 20000, "Part paid"],
    ["Example Interiors", "INV-1060", -12, 18, 58000, 0, ""],
    ["Demo Traders", "INV-0920", -140, -110, 41000, 0, "Promised 15th"],
  ];

  const invoices: Cell[][] = [
    ["Customer", "Invoice no.", "Invoice date", "Due date", "Invoice amount", "Received", "Pending", "Days overdue", "Bucket", "Salesperson", "Notes"].map(
      (h) => s(h, STYLE.header),
    ),
  ];
  for (let i = 0; i < DATA_ROWS; i++) {
    const r = i + 2;
    const sample = samples[i];
    invoices.push([
      sample ? s(sample[0]) : null,
      sample ? s(sample[1]) : null,
      sample ? n(day(sample[2]), STYLE.date) : null,
      sample ? n(day(sample[3]), STYLE.date) : null,
      sample ? n(sample[4], STYLE.money) : null,
      sample ? n(sample[5], STYLE.money) : null,
      f(`IF(E${r}="","",E${r}-N(F${r}))`, STYLE.money),
      f(`IF(OR(D${r}="",G${r}=""),"",IF(G${r}<=0,0,MAX(0,TODAY()-D${r})))`),
      f(
        `IF(OR(D${r}="",G${r}=""),"",IF(G${r}<=0,"Paid",IF(H${r}=0,"${BUCKETS[0]}",IF(H${r}<=30,"${BUCKETS[1]}",IF(H${r}<=60,"${BUCKETS[2]}",IF(H${r}<=90,"${BUCKETS[3]}","${BUCKETS[4]}"))))))`,
      ),
      null,
      sample && sample[6] ? s(sample[6]) : null,
    ]);
  }

  const last = DATA_ROWS + 1;
  const range = (col: string) => `Invoices!$${col}$2:$${col}$${last}`;
  const summary: Cell[][] = [
    [s("Outstanding by age", STYLE.bold)],
    [f(`"As on "&TEXT(TODAY(),"dd-mmm-yyyy")`)],
    [],
    ["Bucket", "Amount pending", "Bills", "Share"].map((h) => s(h, STYLE.header)),
    ...BUCKETS.map((b, i): Cell[] => [
      s(b),
      f(`SUMIF(${range("I")},A${5 + i},${range("G")})`, STYLE.money),
      f(`COUNTIF(${range("I")},A${5 + i})`),
      f(`IF($B$10=0,"",TEXT(B${5 + i}/$B$10,"0%"))`),
    ]),
    [s("Total outstanding", STYLE.bold), f("SUM(B5:B9)", STYLE.moneyBold), f("SUM(C5:C9)", STYLE.bold)],
    [s("Of which past due", STYLE.bold), f("SUM(B6:B9)", STYLE.moneyBold)],
    [],
    [s("By customer", STYLE.bold)],
    ["Customer (type the name)", "Total pending", "Past due", "Oldest bill (days)"].map((h) => s(h, STYLE.header)),
    ...Array.from({ length: 25 }, (_, i): Cell[] => {
      const r = 15 + i;
      const name = ["Sample Hardware Stores", "Example Interiors", "Demo Traders"][i];
      return [
        name ? s(name) : null,
        f(`IF(A${r}="","",SUMIF(${range("A")},A${r},${range("G")}))`, STYLE.money),
        f(`IF(A${r}="","",SUMIFS(${range("G")},${range("A")},A${r},${range("H")},">0"))`, STYLE.money),
        // Largest "days overdue" among this customer's rows; blank rows
        // divide to an error, which AGGREGATE option 6 ignores.
        f(`IF(A${r}="","",IFERROR(AGGREGATE(14,6,${range("H")}/(${range("A")}=A${r}),1),0))`),
      ];
    }),
  ];

  const how: Cell[][] = [
    [s("How to use this sheet", STYLE.bold)],
    [],
    [s("1. On the Invoices sheet, delete the five sample rows and type one row for each unpaid bill: customer, invoice number, invoice date, due date, amount, and anything already received.", STYLE.note)],
    [s("2. Pending, Days overdue and Bucket fill in by themselves. Do not type in those three columns.", STYLE.note)],
    [s("3. Days overdue is counted from the Due date to today, so the sheet ages on its own each time you open it.", STYLE.note)],
    [s("4. When a customer pays, add the amount in Received. A fully paid bill shows Paid and drops out of the totals.", STYLE.note)],
    [s("5. The Summary sheet totals every bucket. Under By customer, type a customer's name exactly as on the Invoices sheet to see their total, how much is past due and their oldest bill.", STYLE.note)],
    [s("6. Using Tally? Export Outstandings > Receivables (bill-wise) to Excel and paste the columns here.", STYLE.note)],
    [],
    [s("Dates must be real dates (for example 15-08-2026), not text. If Days overdue shows an error, retype the due date.", STYLE.note)],
    [s("Room for 300 bills. To add more, copy the last row of the Invoices sheet downwards.", STYLE.note)],
    [],
    [s("This sheet is a snapshot you keep up to date by hand. Syncit does the same from Tally automatically, on each salesperson's phone: https://getsyncit.app", STYLE.note)],
  ];

  const sheets: Sheet[] = [
    { name: "Invoices", rows: invoices, widths: [30, 14, 13, 13, 16, 14, 14, 13, 15, 16, 28], freezeTopRow: true },
    { name: "Summary", rows: summary, widths: [30, 18, 12, 18] },
    { name: "How to use", rows: how, widths: [110] },
  ];
  return buildXlsx(sheets);
}
