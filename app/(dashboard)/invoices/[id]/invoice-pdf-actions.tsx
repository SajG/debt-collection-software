"use client";

import { useState, useTransition } from "react";
import { Loader2, Download, Mail } from "lucide-react";
import { btnSecondaryCls } from "../../_components/ui";
import { emailInvoicePdfAction } from "../actions";

export function InvoicePdfActions({ invoiceId }: { invoiceId: string }) {
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/invoices/${invoiceId}/pdf`} className={btnSecondaryCls} download>
        <Download size={16} /> Download PDF
      </a>
      <button
        className={btnSecondaryCls}
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await emailInvoicePdfAction(invoiceId);
            if ("error" in result) setMessage({ kind: "error", text: result.error });
            else setMessage({ kind: "ok", text: "PDF emailed to the party." });
          });
        }}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
        Email PDF
      </button>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
