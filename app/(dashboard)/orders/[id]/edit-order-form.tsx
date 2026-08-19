"use client";

import { useState, useTransition } from "react";
import type { OrderStatus } from "@prisma/client";
import {
  editOrderBeforeProductionAction,
  adminEditOrderAction,
  confirmOrderDeliveryAction,
} from "../../production/actions";

// Compact editor for the three mutable fields (quantity, rate,
// delivery date). Visibility rules:
//   STAFF   → shown only while ORDER_PLACED (they own it).
//   ADMIN   → shown always; reason required after production starts.
//   FACTORY → not shown.
export function EditOrderForm({
  orderId,
  role,
  currentStatus,
  currentQuantity,
  currentQuantityUnit,
  currentRate,
  currentDeliveryDate,
}: {
  orderId: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
  currentStatus: OrderStatus;
  currentQuantity: string;
  currentQuantityUnit: string;
  currentRate: string;
  currentDeliveryDate: string | null;
}) {
  const isAdmin = role === "ADMIN";
  const requiresReason =
    isAdmin && currentStatus !== "ORDER_PLACED" && currentStatus !== "CANCELLED";

  const [quantity, setQuantity] = useState(currentQuantity);
  const [rate, setRate] = useState(currentRate);
  const [delivery, setDelivery] = useState(currentDeliveryDate ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    quantity !== currentQuantity ||
    rate !== currentRate ||
    delivery !== (currentDeliveryDate ?? "");

  function submit() {
    setError(null);
    setMsg(null);
    const input = {
      orderId,
      quantity: quantity !== currentQuantity ? quantity : undefined,
      productRate: rate !== currentRate ? rate : undefined,
      expectedDeliveryDate:
        delivery !== (currentDeliveryDate ?? "")
          ? delivery || null
          : undefined,
      reason: requiresReason ? reason.trim() : undefined,
    };
    startTransition(async () => {
      const call = isAdmin
        ? adminEditOrderAction(input)
        : editOrderBeforeProductionAction(input);
      const res = await call;
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setMsg("Saved — see the timeline for the edit entry.");
    });
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Change quantity, rate, or delivery date. Every accepted change
        writes an <code>[EDIT]</code> row on the timeline showing the
        before → after value and who made it.
        {requiresReason ? " Reason is required after production starts." : ""}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quantity ({currentQuantityUnit})
          </span>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            inputMode="decimal"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rate
          </span>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Delivery date
          </span>
          <input
            type="date"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {requiresReason && (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reason (required)
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            placeholder="e.g. customer changed quantity mid-production"
          />
        </label>
      )}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            !dirty ||
            (requiresReason && reason.trim().length === 0)
          }
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// F3 companion — one-tap "Mark delivered" for DISPATCHED orders.
// Salesperson (any role that can access the order) can confirm.
export function ConfirmDeliveryButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  function submit() {
    if (
      !window.confirm(
        "Mark this order as delivered? This closes the order-to-delivery loop and cannot be undone from the app.",
      )
    ) {
      return;
    }
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await confirmOrderDeliveryAction({ orderId });
      if ("error" in res) setError(res.error);
      else setMsg("Delivered. Thanks for closing the loop.");
    });
  }
  return (
    <div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Confirming…" : "Mark delivered"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
    </div>
  );
}
