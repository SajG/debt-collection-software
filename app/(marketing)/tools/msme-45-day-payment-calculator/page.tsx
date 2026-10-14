import type { Metadata } from "next";
import Link from "next/link";
import { ToolPage, toolH2 } from "@/components/tools/tool-page";
import { MsmeCalculator } from "@/components/tools/msme-calculator";
import { mkt } from "@/components/marketing/tokens";

const PATH = "/tools/msme-45-day-payment-calculator";

export const metadata: Metadata = {
  title: "MSME 45-day payment calculator — Section 43B(h) due date & disallowance",
  description:
    "Free calculator for Section 43B(h): find the last date to pay a micro or small enterprise (15 or 45 days), and estimate the disallowance and extra tax if payment is late.",
  alternates: { canonical: `https://getsyncit.app${PATH}` },
  openGraph: {
    title: "MSME 45-day payment calculator (Section 43B(h))",
    description: "Due date under the MSMED Act and the disallowance if you miss it.",
    url: `https://getsyncit.app${PATH}`,
    siteName: "Syncit",
    locale: "en_IN",
    type: "website",
  },
};

const FAQ = [
  {
    q: "What is the 45-day rule under Section 43B(h)?",
    a: "A payment to a micro or small enterprise is deductible in the year you book it only if it is paid within the time allowed by section 15 of the MSMED Act: the period agreed in writing, up to a maximum of 45 days, or 15 days when there is no written agreement. Paid later, it is deductible only in the year of actual payment.",
  },
  {
    q: "From which date are the 15 or 45 days counted?",
    a: "From the day of acceptance — normally the day goods are delivered or services rendered. If the buyer raises a written objection within 15 days of delivery, the days run from the date the supplier removes the objection.",
  },
  {
    q: "Is the whole purchase disallowed if I pay a few days late?",
    a: "No. Only an amount that is beyond its time limit and still unpaid on 31 March is disallowed for that year. If you pay late but before the year ends, the deduction stays; interest under the MSMED Act may still be due.",
  },
  {
    q: "Can I pay before filing my return to save the deduction?",
    a: "No. The relief for payments made before the return due date applies to other clauses of section 43B, not to clause (h).",
  },
  {
    q: "Does it apply to purchases from medium enterprises or traders?",
    a: "Medium enterprises are not covered. For wholesale and retail traders the widely held view is that the delayed-payment provisions do not apply, because their Udyam registration is for priority-sector lending only — confirm this with your chartered accountant.",
  },
  {
    q: "Is the disallowance a permanent loss?",
    a: "No. The amount becomes deductible in the year you pay it. The cost is paying tax on it a year early, plus MSMED interest, which is not deductible at all.",
  },
];

export default function MsmeCalculatorPage() {
  return (
    <ToolPage
      path={PATH}
      name="MSME 45-day payment calculator"
      title="MSME 45-day payment calculator (Section 43B(h))"
      intro="Enter the delivery date and terms. See the last date to pay a micro or small supplier, and what is disallowed if it is missed."
      faq={FAQ}
      related={[
        { href: "/blog/msme-45-day-payment-rule-43bh-for-distributors", label: "The 45-day rule explained for manufacturers and distributors" },
        { href: "/tools/dso-calculator", label: "DSO calculator — how long do your customers take to pay?" },
        { href: "/tools/outstanding-ageing-template", label: "Outstanding ageing template (Excel)" },
        { href: "/blog/polite-payment-reminder-messages-english-hindi", label: "Reminder messages in English and Hindi" },
        { href: "/features", label: "How Syncit reminds customers before the due date" },
      ]}
      explainer={
        <>
          <h2 className={toolH2} style={{ color: mkt.ink }}>
            How the calculator works
          </h2>
          <p>
            <strong>Time limit.</strong> With a written agreement, the agreed credit period — but never more than 45 days.
            Without one, 15 days. Counted from the day the goods or services were accepted.
          </p>
          <p>
            <strong>Disallowance.</strong> The amount is disallowed for the financial year of the purchase only when it
            is paid after its time limit <em>and</em> is still unpaid on 31 March. It is then allowed in the year of
            payment.
          </p>
          <p>
            <strong>Estimated tax.</strong> The disallowed amount multiplied by the tax rate you enter. It is tax paid a
            year early, not an extra tax for ever.
          </p>
          <p>
            The calculator does not work out interest under section 16 of the MSMED Act (compound, monthly, at three
            times the bank rate), and it assumes the supplier is a micro or small enterprise with Udyam registration.
          </p>
          <p className="rounded-lg px-4 py-3 text-base" style={{ backgroundColor: mkt.amberLight, color: mkt.ink }}>
            This is a planning aid, not tax advice. Check your position with your chartered accountant.
          </p>
          <h2 className={toolH2} style={{ color: mkt.ink }}>
            If you are the supplier
          </h2>
          <p>
            Print your Udyam number and the due date on every invoice, and send customers a statement in February
            showing which bills will be past their limit on 31 March. In Syncit that is one tap —{" "}
            <Link href="/help/payment-reminders" className="underline underline-offset-4" style={{ color: mkt.teal }}>
              see how reminders and statements work
            </Link>
            .
          </p>
        </>
      }
    >
      <MsmeCalculator />
    </ToolPage>
  );
}
