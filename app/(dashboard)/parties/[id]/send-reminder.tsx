"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { inputCls, btnPrimaryCls } from "../../_components/ui";
import { sendReminderAction } from "../../messages/actions";

type Channel = "WHATSAPP" | "SMS" | "EMAIL";

export function SendReminder({
  partyId,
  openInvoices,
}: {
  partyId: string;
  openInvoices: { id: string; label: string }[];
}) {
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [invoiceId, setInvoiceId] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "sent" | "blocked" | "failed";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    setFeedback(null);
    startTransition(async () => {
      const result = await sendReminderAction({ partyId, channel, invoiceId });
      if (result.status === "sent") {
        setFeedback({ kind: "sent", text: "Reminder sent and logged." });
      } else if (result.status === "blocked") {
        setFeedback({ kind: "blocked", text: `Not sent — ${result.reason}.` });
      } else {
        setFeedback({ kind: "failed", text: `Send failed — ${result.error}.` });
      }
    });
  }

  const feedbackCls = {
    sent: "text-emerald-700",
    blocked: "text-amber-700",
    failed: "text-red-600",
  } as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">
            Channel
          </span>
          <select
            className={inputCls}
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
          >
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
          </select>
        </label>
        <label className="block min-w-52">
          <span className="mb-1 block text-xs font-medium text-foreground">
            About
          </span>
          <select
            className={inputCls}
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
          >
            <option value="">Total outstanding</option>
            {openInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending}
          className={btnPrimaryCls}
        >
          {isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          Send reminder
        </button>
      </div>
      {feedback && (
        <p role="status" className={`text-sm ${feedbackCls[feedback.kind]}`}>
          {feedback.text}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Every send — including this button — passes the consent, quiet-hours,
        and frequency-cap checks, and is logged to the audit trail.
      </p>
    </div>
  );
}
