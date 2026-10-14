import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage, toolH2 } from "@/components/tools/tool-page";
import { DsoCalculator } from "@/components/tools/dso-calculator";
import { mkt } from "@/components/marketing/tokens";

const PATH = "/tools/dso-calculator";

export const metadata: Metadata = {
  title: "DSO calculator — Days Sales Outstanding for Indian businesses",
  description:
    "Free DSO calculator: work out how many days customers take to pay, how far that is beyond your credit terms, the cash tied up and what it costs to finance.",
  alternates: { canonical: `https://getsyncit.app${PATH}` },
  openGraph: {
    title: "DSO calculator",
    description: "Days sales outstanding, cash tied up beyond terms, and what it costs.",
    url: `https://getsyncit.app${PATH}`,
    siteName: "Syncit",
    locale: "en_IN",
    type: "website",
  },
};

const FAQ = [
  {
    q: "What is DSO?",
    a: "Days Sales Outstanding is the average number of days it takes to be paid after a credit sale. DSO = receivables ÷ credit sales × number of days in the period.",
  },
  {
    q: "What is a good DSO?",
    a: "One close to your own credit terms. If you give 45 days and your DSO is 50, collections are healthy. A DSO 20 or 30 days above terms means a large part of your receivables is simply overdue.",
  },
  {
    q: "Should I use total sales or credit sales?",
    a: "Credit sales. Including cash sales makes DSO look better than it is.",
  },
  {
    q: "Why does my DSO jump at month-end or in season?",
    a: "DSO compares today's receivables with average sales. After a heavy sales month receivables are high but not yet late, so DSO rises. Compare the same month year on year, or use a 12-month period to smooth it.",
  },
  {
    q: "How is 'cash tied up beyond terms' worked out?",
    a: "Credit sales per day multiplied by the number of days your DSO exceeds your terms. It is the money you would have in the bank if customers paid on the due date.",
  },
  {
    q: "How do I bring DSO down?",
    a: "Invoice on the day of dispatch, state the due date as a date, remind customers before the due date, record every payment promise, and review ageing by salesperson every week.",
  },
];

export default function DsoCalculatorPage() {
  return (
    <ToolPage
      path={PATH}
      name="DSO calculator"
      title="DSO calculator"
      intro="How many days do your customers take to pay — and what is the delay costing you?"
      faq={FAQ}
      related={[
        { href: "/blog/how-to-reduce-dso-for-a-manufacturing-business", label: "Seven ways to reduce DSO in a manufacturing business" },
        { href: "/tools/outstanding-ageing-template", label: "Outstanding ageing template (Excel)" },
        { href: "/tools/msme-45-day-payment-calculator", label: "MSME 45-day payment calculator (43B(h))" },
        { href: "/help/credit-limits", label: "Setting credit limits per customer" },
        { href: "/pricing", label: "Syncit pricing" },
      ]}
      explainer={
        <>
          <h2 className={toolH2} style={{ color: mkt.ink }}>
            The formula
          </h2>
          <p>
            <strong>DSO = (Receivables ÷ Credit sales) × Days in the period.</strong> Use the receivables figure from
            today (or the period end) and credit sales for the same period.
          </p>
          <p>
            The example filled in above is a manufacturer with ₹12 crore of yearly credit sales and ₹2.4 crore owed by
            customers: a DSO of 73 days against 45-day terms. That is 28 days of sales — about ₹92 lakh — being financed
            by the business.
          </p>
          <h2 className={toolH2} style={{ color: mkt.ink }}>
            What DSO does not tell you
          </h2>
          <p>
            DSO is an average. It will not show that one customer is 120 days late while the rest pay on time. For that
            you need ageing, bill by bill — start with the{" "}
            <Link href="/tools/outstanding-ageing-template" className="underline underline-offset-4" style={{ color: mkt.teal }}>
              ageing template
            </Link>
            , or let{" "}
            <Link href="/tally" className="underline underline-offset-4" style={{ color: mkt.teal }}>
              Syncit read it from Tally
            </Link>{" "}
            every day.
          </p>
        </>
      }
    >
      <DsoCalculator />
    </ToolPage>
  );
}
