import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage, toolH2 } from "@/components/tools/tool-page";
import { mkt } from "@/components/marketing/tokens";

const PATH = "/tools/outstanding-ageing-template";

export const metadata: Metadata = {
  title: "Outstanding ageing template (Excel) — free download",
  description:
    "Free Excel ageing template: enter unpaid invoices and get days overdue, 0–30 / 31–60 / 61–90 / 90+ buckets, and totals per customer automatically.",
  alternates: { canonical: `https://getsyncit.app${PATH}` },
  openGraph: {
    title: "Outstanding ageing template (Excel)",
    description: "Days overdue and ageing buckets, worked out for you.",
    url: `https://getsyncit.app${PATH}`,
    siteName: "Syncit",
    locale: "en_IN",
    type: "website",
  },
};

const FAQ = [
  {
    q: "What is an ageing report?",
    a: "A list of unpaid invoices grouped by how long they have been overdue — typically not yet due, 0–30, 31–60, 61–90 and over 90 days. It shows where the risk is, which a single outstanding total cannot.",
  },
  {
    q: "Which programs open the template?",
    a: "Microsoft Excel 2010 or later, Google Sheets and LibreOffice Calc. It is a normal .xlsx file with formulas and no macros.",
  },
  {
    q: "Is ageing counted from the invoice date or the due date?",
    a: "From the due date. A bill inside its credit period shows as 'Not yet due'. If you prefer ageing from invoice date, put the invoice date in the Due date column.",
  },
  {
    q: "How do I get the data out of Tally?",
    a: "Gateway of Tally → Display More Reports → Statements of Accounts → Outstandings → Receivables, then export to Excel and paste the customer, bill number, dates and amounts into the Invoices sheet. Bill-wise details must be on in Tally.",
  },
  {
    q: "Does the sheet update itself?",
    a: "Days overdue and buckets recalculate every time you open the file, because they use today's date. New invoices and payments have to be typed in.",
  },
  {
    q: "Is anything sent to Syncit when I download it?",
    a: "No. The file is generated when you click and contains only sample rows. Nothing you later type into it leaves your computer.",
  },
];

export default function AgeingTemplatePage() {
  return (
    <ToolPage
      path={PATH}
      name="Outstanding ageing template"
      eyebrow="Free template"
      title="Outstanding ageing template (Excel)"
      intro="Type your unpaid bills. Days overdue, ageing buckets and totals per customer fill in by themselves."
      faq={FAQ}
      related={[
        { href: "/blog/bill-wise-outstanding-in-tally-explained", label: "Bill-wise outstanding in Tally explained" },
        { href: "/blog/tally-outstanding-report-on-your-phone", label: "Tally outstanding report on your phone" },
        { href: "/tools/dso-calculator", label: "DSO calculator" },
        { href: "/help/upload-excel", label: "Upload your sheet into Syncit" },
        { href: "/tally", label: "Skip the sheet: connect Tally" },
      ]}
      explainer={
        <>
          <h2 className={toolH2} style={{ color: mkt.ink }}>
            What is in the file
          </h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Invoices</strong> — one row per unpaid bill: customer, invoice number, invoice date, due date,
              amount, received. <em>Pending</em>, <em>Days overdue</em> and <em>Bucket</em> are formulas. Room for 300
              bills.
            </li>
            <li>
              <strong>Summary</strong> — amount and number of bills in each bucket, total outstanding, how much is past
              due, and a per-customer view.
            </li>
            <li>
              <strong>How to use</strong> — six short steps.
            </li>
          </ul>
          <h2 className={toolH2} style={{ color: mkt.ink }}>
            Reading it
          </h2>
          <p>
            Look at the two oldest buckets first. Money past 90 days is the money most at risk; ask about every name
            there each week until it moves. Then look at who owns each customer — an ageing report by salesperson
            turns &ldquo;our outstanding is high&rdquo; into a conversation with one person about five bills.
          </p>
          <p>
            A spreadsheet is right for a few dozen customers. When several people follow up, the promise a customer
            made on Tuesday needs to sit next to the bill —{" "}
            <Link href="/features" className="underline underline-offset-4" style={{ color: mkt.teal }}>
              that is what Syncit is for
            </Link>
            .
          </p>
        </>
      }
    >
      <div className="flex flex-col items-start gap-4">
        <a
          href={`${PATH}/download`}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-lg font-semibold text-white"
          style={{ backgroundColor: mkt.teal }}
          download
        >
          Download the template (.xlsx)
        </a>
        <p className="text-base" style={{ color: mkt.ink2 }}>
          Free. No sign-up, no email. About 25 KB, no macros.
        </p>
      </div>
    </ToolPage>
  );
}
