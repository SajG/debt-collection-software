"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { OrderStatus } from "@prisma/client";
import { nextStatus, nextStatusLabel } from "../orders/order-status";
import { advanceOrderStatusAction } from "../orders/actions";

type ProductionOrder = {
  id: string;
  orderNumber: string;
  partyName: string;
  productName: string;
  brand: string | null;
  quantity: string;
  quantityUnit: string;
  packingType: string;
  sizeKg: string;
  salespersonName: string;
  currentStatus: OrderStatus;
  expectedDate: string | null;
  urgency: "overdue" | "today" | "future" | "none";
  urgencyDays: number | null;
};

// Colour tokens for the whole row, chosen for maximum contrast on a factory
// tablet under fluorescent lighting rather than the softer app palette.
const URGENCY_STYLES = {
  overdue: {
    row: "border-red-500 bg-red-50",
    tag: "bg-red-600 text-white",
    label: (d: number) => `${Math.abs(d)}d overdue`,
  },
  today: {
    row: "border-amber-500 bg-amber-50",
    tag: "bg-amber-500 text-white",
    label: () => "Due today",
  },
  future: {
    row: "border-border bg-card",
    tag: "bg-emerald-100 text-emerald-800",
    label: (d: number) => `in ${d}d`,
  },
  none: {
    row: "border-border bg-card",
    tag: "bg-muted text-muted-foreground",
    label: () => "no date",
  },
} as const;

export function ProductionItem({
  order,
  canAdvance,
}: {
  order: ProductionOrder;
  canAdvance: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const next = nextStatus(order.currentStatus);
  const label = nextStatusLabel(order.currentStatus);
  const style = URGENCY_STYLES[order.urgency];

  function submitAdvance() {
    if (!next) return;
    startTransition(async () => {
      const result = await advanceOrderStatusAction(order.id, {
        status: next,
        notes: note.trim() || undefined,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${order.orderNumber} → ${next.replace(/_/g, " ")}`
      );
      setConfirmOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <li
      className={`rounded-xl border-2 p-5 shadow-sm transition-colors ${style.row}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <Link
              href={`/orders/${order.id}`}
              className="text-xl font-semibold text-foreground hover:underline"
            >
              {order.orderNumber}
            </Link>
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold ${style.tag}`}
            >
              {order.expectedDate ?? "—"}
              {order.urgencyDays !== null && (
                <>
                  {" · "}
                  {style.label(order.urgencyDays)}
                </>
              )}
            </span>
            <span className="inline-block rounded bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground">
              {order.currentStatus.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-2 text-lg font-medium text-foreground">
            {order.productName}
            {order.brand && (
              <span className="text-muted-foreground"> · {order.brand}</span>
            )}
          </p>
          <p className="text-base text-foreground">
            {order.quantity} {order.quantityUnit} · {order.packingType} ·{" "}
            {order.sizeKg} kg
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.partyName} · {order.salespersonName}
          </p>
        </div>

        {canAdvance && next && label && (
          <button
            className="min-h-[64px] min-w-[180px] rounded-xl bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {label}
          </button>
        )}
      </div>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`confirm-${order.id}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              setConfirmOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2
                id={`confirm-${order.id}`}
                className="text-xl font-semibold text-foreground"
              >
                {label}?
              </h2>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => !isPending && setConfirmOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="mb-4 text-base text-foreground">
              Move{" "}
              <span className="font-semibold">{order.orderNumber}</span> to{" "}
              <span className="font-semibold">
                {next?.replace(/_/g, " ")}
              </span>
              .
            </p>
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                Note (optional)
              </span>
              <textarea
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. lot 234, packed on line 2"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="min-h-[52px] min-w-[110px] rounded-lg border border-border bg-white px-5 text-base font-medium text-foreground hover:bg-muted disabled:opacity-60"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                className="min-h-[52px] min-w-[140px] rounded-lg bg-primary px-5 text-base font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                onClick={submitAdvance}
                disabled={isPending}
              >
                {isPending && (
                  <Loader2
                    size={18}
                    className="mr-2 inline-block animate-spin"
                  />
                )}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
