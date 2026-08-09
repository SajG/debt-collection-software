"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { btnPrimaryCls, btnSecondaryCls, inputCls, Field } from "../../_components/ui";
import { nextStatus, nextStatusLabel } from "../order-status";
import {
  advanceOrderStatusAction,
  linkOrderToInvoiceAction,
  unlinkOrderFromInvoiceAction,
} from "../actions";

type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  invoiceDate: string;
};

export function OrderDetailActions({
  orderId,
  status,
  linkedInvoice,
  invoiceOptions,
}: {
  orderId: string;
  status: OrderStatus;
  linkedInvoice: { id: string; invoiceNumber: string } | null;
  invoiceOptions: InvoiceOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pickedInvoiceId, setPickedInvoiceId] = useState(
    linkedInvoice?.id ?? ""
  );

  const next = nextStatus(status);
  const nextLabel = nextStatusLabel(status);
  const terminal = status === "DISPATCHED" || status === "CANCELLED";
  const linkable = status === "LR_GENERATED" || status === "DISPATCHED";

  function run<T extends { error: string } | { ok: true } | never>(
    fn: () => Promise<T>,
    okText: string
  ) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result) {
        setMessage({ kind: "error", text: result.error });
      } else {
        setMessage({ kind: "ok", text: okText });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {next && nextLabel && (
          <button
            className={btnPrimaryCls}
            disabled={isPending}
            onClick={() =>
              run(
                () => advanceOrderStatusAction(orderId, { status: next }),
                `Moved to ${next.replace(/_/g, " ")}.`
              )
            }
          >
            {nextLabel} →
          </button>
        )}
        {!terminal && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            disabled={isPending}
            onClick={() => {
              if (window.confirm("Cancel this order? This cannot be undone.")) {
                run(
                  () =>
                    advanceOrderStatusAction(orderId, {
                      status: "CANCELLED",
                      notes: "Cancelled from order detail.",
                    }),
                  "Order cancelled."
                );
              }
            }}
          >
            Cancel order
          </button>
        )}
        {isPending && (
          <Loader2 size={16} className="mt-2 animate-spin text-muted-foreground" />
        )}
      </div>

      {linkable && (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field
              label={
                linkedInvoice
                  ? "Change linked invoice"
                  : "Link to invoice (same party)"
              }
            >
              <select
                className={inputCls}
                value={pickedInvoiceId}
                onChange={(e) => setPickedInvoiceId(e.target.value)}
              >
                <option value="">Select invoice…</option>
                {invoiceOptions.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — ₹{Number(inv.totalAmount).toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className={btnPrimaryCls}
              disabled={
                isPending ||
                !pickedInvoiceId ||
                pickedInvoiceId === linkedInvoice?.id
              }
              onClick={() =>
                run(
                  () => linkOrderToInvoiceAction(orderId, pickedInvoiceId),
                  "Invoice linked."
                )
              }
            >
              Link invoice
            </button>
            {linkedInvoice && (
              <button
                className={btnSecondaryCls}
                disabled={isPending}
                onClick={() =>
                  run(
                    () => unlinkOrderFromInvoiceAction(orderId),
                    "Invoice unlinked."
                  )
                }
              >
                Unlink
              </button>
            )}
          </div>
          {invoiceOptions.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              No invoices exist yet for this party. Create one on the invoices
              page first.
            </p>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${
            message.kind === "error" ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
