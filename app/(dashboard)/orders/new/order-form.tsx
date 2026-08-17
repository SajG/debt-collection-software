"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { formatINR } from "@/lib/format";
import {
  Field,
  Card,
  btnPrimaryCls,
  btnSecondaryCls,
  inputCls,
} from "../../_components/ui";
import { createSalesOrderAction } from "../actions";

export type OrderFormParty = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  outstanding: string;
  creditLimit: string | null;
  creditDays: number | null;
};

export type OrderFormProduct = {
  id: string;
  name: string;
  brand: string;
};

export type OrderFormStock = {
  name: string;
  category: string | null;
  unit: string | null;
  closingQty: string;
  lastSyncedAt: string | null;
};

function parseRate(raw: string): number {
  const m = raw.replace(/[₹,\s]/g, "").match(/-?[\d.]+/);
  return m ? Number(m[0]) : 0;
}

function formatOutstandingAgo(iso: string | null): string {
  if (!iso) return "never synced";
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function OrderForm({
  role,
  parties,
  products,
  stock,
}: {
  role: Role;
  parties: OrderFormParty[];
  products: OrderFormProduct[];
  stock: OrderFormStock[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    parties.length > 0 ? "existing" : "new"
  );
  const [partyQuery, setPartyQuery] = useState("");
  const [partyId, setPartyId] = useState<string>("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const [productId, setProductId] = useState<string>(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState<"PCS" | "KG" | "NOS">("PCS");
  const [packingType, setPackingType] = useState("");
  const [sizeKg, setSizeKg] = useState("");
  const [productRate, setProductRate] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [transportType, setTransportType] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [creditOverrideNote, setCreditOverrideNote] = useState("");

  const filteredParties = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties.slice(0, 30);
    return parties
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone || "").includes(q) ||
          (p.city || "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [parties, partyQuery]);

  const selectedParty = parties.find((p) => p.id === partyId) ?? null;
  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  const orderValue = useMemo(() => {
    const q = Number(quantity.replace(/,/g, ""));
    const r = parseRate(productRate);
    if (!Number.isFinite(q) || !Number.isFinite(r)) return 0;
    return Number((q * r).toFixed(2));
  }, [quantity, productRate]);

  // Live stock lookup — fuzzy match against Tally stock names for selected product
  const matchingStock = useMemo(() => {
    if (!selectedProduct) return [];
    const brand = selectedProduct.brand.toLowerCase();
    const name = selectedProduct.name.toLowerCase();
    return stock
      .filter(
        (s) =>
          s.name.toLowerCase().includes(brand) ||
          s.name.toLowerCase().includes(name) ||
          (s.category ?? "").toLowerCase().includes(brand)
      )
      .slice(0, 8);
  }, [stock, selectedProduct]);

  const outstanding = selectedParty
    ? Number(selectedParty.outstanding)
    : 0;
  const creditLimit = selectedParty?.creditLimit
    ? Number(selectedParty.creditLimit)
    : null;
  const projected = outstanding + orderValue;
  const overLimit = creditLimit != null && projected > creditLimit;
  const canOverride = role === "ADMIN";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createSalesOrderAction(fd);
      if ("error" in res) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      router.push(`/orders/${res.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
      {/* Left column — customer + product + delivery */}
      <div className="space-y-6 lg:col-span-2">
        <Card title="Customer">
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setCustomerMode("existing")}
              className={[
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                customerMode === "existing"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white text-foreground hover:bg-muted",
              ].join(" ")}
            >
              Existing customer
            </button>
            <button
              type="button"
              onClick={() => setCustomerMode("new")}
              className={[
                "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                customerMode === "new"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white text-foreground hover:bg-muted",
              ].join(" ")}
            >
              New customer
            </button>
          </div>
          <input type="hidden" name="customerMode" value={customerMode} />

          {customerMode === "existing" ? (
            <div className="space-y-3">
              <Field label="Search your ledger">
                <input
                  type="text"
                  className={inputCls}
                  placeholder={
                    parties.length === 0
                      ? "No customers assigned to you yet"
                      : "Type name, phone or city…"
                  }
                  value={partyQuery}
                  onChange={(e) => setPartyQuery(e.target.value)}
                  disabled={parties.length === 0}
                />
              </Field>
              <input type="hidden" name="partyId" value={partyId} />
              {parties.length > 0 && (
                <ul className="max-h-64 overflow-y-auto rounded-md border border-border">
                  {filteredParties.map((p) => {
                    const selected = partyId === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setPartyId(p.id)}
                          className={[
                            "w-full border-b border-border/60 px-3 py-2.5 text-left text-sm transition-colors last:border-b-0",
                            selected
                              ? "bg-primary/10"
                              : "hover:bg-muted/40",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {p.name}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {formatINR(p.outstanding)} outstanding
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[p.city, p.phone].filter(Boolean).join(" · ") ||
                              "No contact on file"}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                  {filteredParties.length === 0 && (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No matches.
                    </li>
                  )}
                </ul>
              )}
              {fieldErrors.partyId && (
                <p className="text-sm text-red-600">{fieldErrors.partyId}</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Customer name">
                <input
                  type="text"
                  name="newCustomerName"
                  className={inputCls}
                  placeholder="e.g. New City Hardware"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
                {fieldErrors.newCustomerName && (
                  <p className="mt-1 text-sm text-red-600">
                    {fieldErrors.newCustomerName}
                  </p>
                )}
              </Field>
              <Field label="Phone (optional)">
                <input
                  type="tel"
                  name="newCustomerPhone"
                  className={inputCls}
                  placeholder="10-digit mobile"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
              </Field>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Recorded as a new-customer order. Will be matched to the ledger
                once the customer appears in the next Tally sync.
              </p>
            </div>
          )}
        </Card>

        <Card title="Product & quantity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product">
              <select
                name="productId"
                className={inputCls}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand} — {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  name="quantity"
                  className={inputCls}
                  placeholder="e.g. 50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <select
                  name="quantityUnit"
                  className={`${inputCls} w-24`}
                  value={quantityUnit}
                  onChange={(e) =>
                    setQuantityUnit(e.target.value as "PCS" | "KG" | "NOS")
                  }
                >
                  <option value="PCS">PCS</option>
                  <option value="KG">KG</option>
                  <option value="NOS">NOS</option>
                </select>
              </div>
              {fieldErrors.quantity && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.quantity}
                </p>
              )}
            </Field>
            <Field label="Packing (optional)">
              <input
                type="text"
                name="packingType"
                className={inputCls}
                placeholder="Carton / Bag / Box"
                value={packingType}
                onChange={(e) => setPackingType(e.target.value)}
              />
            </Field>
            <Field label="Size in kg (optional)">
              <input
                type="text"
                inputMode="decimal"
                name="sizeKg"
                className={inputCls}
                placeholder="e.g. 5"
                value={sizeKg}
                onChange={(e) => setSizeKg(e.target.value)}
              />
            </Field>
            <Field label="Rate">
              <input
                type="text"
                inputMode="decimal"
                name="productRate"
                className={inputCls}
                placeholder="e.g. 185"
                value={productRate}
                onChange={(e) => setProductRate(e.target.value)}
              />
              {fieldErrors.productRate && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldErrors.productRate}
                </p>
              )}
            </Field>
            <Field label="Order value">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-semibold text-foreground">
                {formatINR(orderValue)}
              </div>
            </Field>
          </div>

          {selectedProduct && (
            <div className="mt-5 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Stock in factory (from Tally)
              </p>
              {matchingStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Tally stock item matched — confirm availability with factory
                  before promising delivery.
                </p>
              ) : (
                <ul className="space-y-1">
                  {matchingStock.map((s) => {
                    const qty = Number(s.closingQty);
                    const low = qty <= 0;
                    return (
                      <li
                        key={s.name}
                        className="flex flex-wrap items-baseline justify-between gap-2"
                      >
                        <span className="font-medium text-foreground">
                          {s.name}
                        </span>
                        <span
                          className={
                            low
                              ? "font-mono text-sm font-semibold text-red-700"
                              : "font-mono text-sm text-emerald-700"
                          }
                        >
                          {qty.toLocaleString("en-IN")} {s.unit ?? ""}
                        </span>
                      </li>
                    );
                  })}
                  <li className="pt-1 text-xs text-muted-foreground">
                    Synced {formatOutstandingAgo(matchingStock[0].lastSyncedAt)}
                  </li>
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card title="Delivery & terms">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expected delivery date">
              <input
                type="date"
                name="expectedDeliveryDate"
                className={inputCls}
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </Field>
            <Field label="Payment term">
              <input
                type="text"
                name="paymentTerm"
                className={inputCls}
                placeholder="e.g. 30 days / Advance"
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value)}
              />
            </Field>
            <Field label="Transport">
              <input
                type="text"
                name="transportType"
                className={inputCls}
                placeholder="e.g. By Road / Self pickup"
                value={transportType}
                onChange={(e) => setTransportType(e.target.value)}
              />
            </Field>
            <Field label="Notes (optional)">
              <input
                type="text"
                name="notes"
                className={inputCls}
                placeholder="Special instructions"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </Card>
      </div>

      {/* Right column — credit + submit */}
      <div className="space-y-6">
        <Card title="Credit position">
          {customerMode === "new" ? (
            <p className="text-sm text-muted-foreground">
              New customer — no ledger balance yet. Consider advance payment.
            </p>
          ) : !selectedParty ? (
            <p className="text-sm text-muted-foreground">
              Choose a customer to see outstanding + credit headroom.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <Row
                label="Current outstanding"
                value={formatINR(outstanding)}
                emphasise
              />
              <Row
                label="Credit limit"
                value={
                  creditLimit == null ? "Not set" : formatINR(creditLimit)
                }
              />
              <Row label="This order" value={formatINR(orderValue)} />
              <div className="my-2 border-t border-border" />
              <Row
                label="Projected total"
                value={formatINR(projected)}
                emphasise
              />
              {creditLimit != null && (
                <Row
                  label="Headroom"
                  value={formatINR(creditLimit - projected)}
                  tone={overLimit ? "danger" : "success"}
                />
              )}
              {selectedParty.creditDays != null && (
                <p className="text-xs text-muted-foreground">
                  Agreed credit period: {selectedParty.creditDays} days.
                </p>
              )}

              {overLimit && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-semibold text-red-800">
                    Credit limit will be exceeded.
                  </p>
                  <p className="mt-1 text-xs text-red-700">
                    {canOverride
                      ? "Enter an override note below to place anyway."
                      : "Ask an admin to review, or collect outstanding first before placing."}
                  </p>
                  <p className="mt-2">
                    <Link
                      href={`/parties/${selectedParty.id}`}
                      className="text-xs font-medium text-red-800 underline"
                    >
                      Open customer & send reminder →
                    </Link>
                  </p>
                </div>
              )}

              {overLimit && canOverride && (
                <Field label="Override reason">
                  <textarea
                    name="creditOverrideNote"
                    className={inputCls}
                    rows={3}
                    placeholder="Why this order can go ahead past the limit"
                    value={creditOverrideNote}
                    onChange={(e) => setCreditOverrideNote(e.target.value)}
                  />
                  {fieldErrors.creditOverrideNote && (
                    <p className="mt-1 text-sm text-red-600">
                      {fieldErrors.creditOverrideNote}
                    </p>
                  )}
                </Field>
              )}
            </div>
          )}
        </Card>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            className={`${btnPrimaryCls} min-h-12 text-base`}
            disabled={
              isPending ||
              (customerMode === "existing" && !partyId) ||
              (customerMode === "new" && !newCustomerName) ||
              !productId ||
              !quantity ||
              !productRate ||
              (overLimit && !canOverride)
            }
          >
            {isPending ? "Placing…" : "Place order"}
          </button>
          <Link href="/orders" className={`${btnSecondaryCls} min-h-12`}>
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  emphasise,
  tone,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
  tone?: "success" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-700"
      : tone === "success"
        ? "text-emerald-700"
        : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={[
          "font-mono",
          emphasise ? "text-base font-semibold" : "text-sm",
          toneCls,
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
