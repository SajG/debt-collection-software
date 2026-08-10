"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  inputCls,
  btnPrimaryCls,
  Field,
} from "../_components/ui";
import { createOrderAction } from "./actions";
import type { OrderInput } from "@/lib/validation";

type Party = { id: string; name: string };
type Product = { id: string; name: string; brand: string | null };
type Salesperson = { id: string; ownerName: string };

const QUANTITY_UNITS: OrderInput["quantityUnit"][] = ["PCS", "KG", "NOS"];
const PAYMENT_TERMS: OrderInput["paymentTerm"][] = [
  "ADVANCE",
  "CREDIT",
  "PDC",
  "IMMEDIATE",
  "AGAINST_DISPATCH",
  "OTHER",
];
const TRANSPORT_TYPES: OrderInput["transportType"][] = [
  "PAID",
  "TO_PAY",
  "GODOWN",
  "DOOR",
  "OTHER",
];

export function OrderForm({
  parties,
  products,
  salespeople,
  showSalespersonPicker,
}: {
  parties: Party[];
  products: Product[];
  /** Provided only for ADMIN — STAFF are always their own salesperson. */
  salespeople?: Salesperson[];
  showSalespersonPicker: boolean;
}) {
  const [values, setValues] = useState<OrderInput>({
    partyId: "",
    salespersonId: "",
    productId: "",
    brand: "",
    quantity: "",
    quantityUnit: "KG",
    packingType: "",
    sizeKg: "",
    productRate: "",
    paymentTerm: "IMMEDIATE",
    transportType: "PAID",
    expectedDeliveryDate: "",
    tokenType: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof OrderInput>(k: K, v: OrderInput[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  function onProductChange(id: string) {
    const brand = productById.get(id)?.brand ?? "";
    setValues((prev) => ({
      ...prev,
      productId: id,
      // Only autofill brand if the user hasn't typed their own override.
      brand: prev.brand ? prev.brand : brand,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOrderAction(values);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Party *">
          <select
            className={inputCls}
            value={values.partyId}
            onChange={(e) => set("partyId", e.target.value)}
            required
          >
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        {showSalespersonPicker && salespeople && (
          <Field label="Salesperson *">
            <select
              className={inputCls}
              value={values.salespersonId ?? ""}
              onChange={(e) => set("salespersonId", e.target.value)}
              required
            >
              <option value="">Select salesperson…</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ownerName}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Product *">
          <select
            className={inputCls}
            value={values.productId}
            onChange={(e) => onProductChange(e.target.value)}
            required
          >
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.brand ? ` — ${p.brand}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand">
          <input
            className={inputCls}
            value={values.brand ?? ""}
            onChange={(e) => set("brand", e.target.value)}
            placeholder="Auto-filled from product"
            maxLength={80}
          />
        </Field>
        <Field label="Token type">
          <input
            className={inputCls}
            value={values.tokenType ?? ""}
            onChange={(e) => set("tokenType", e.target.value)}
            placeholder="e.g. blue, red"
            maxLength={80}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Quantity *">
          <input
            className={inputCls}
            type="number"
            min="0.001"
            step="any"
            value={values.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            required
          />
        </Field>
        <Field label="Unit *">
          <select
            className={inputCls}
            value={values.quantityUnit}
            onChange={(e) =>
              set("quantityUnit", e.target.value as OrderInput["quantityUnit"])
            }
          >
            {QUANTITY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size (kg) *">
          <input
            className={inputCls}
            value={values.sizeKg}
            onChange={(e) => set("sizeKg", e.target.value)}
            placeholder='e.g. 20 or "5+1 free"'
            required
            maxLength={50}
          />
        </Field>
        <Field label="Packing *">
          <input
            className={inputCls}
            value={values.packingType}
            onChange={(e) => set("packingType", e.target.value)}
            placeholder="drum / carton / bag"
            required
            maxLength={50}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Product rate *">
          <input
            className={inputCls}
            value={values.productRate}
            onChange={(e) => set("productRate", e.target.value)}
            placeholder='e.g. 125++ or "Last rate + 15/-"'
            required
            maxLength={100}
          />
        </Field>
        <Field label="Payment term *">
          <select
            className={inputCls}
            value={values.paymentTerm}
            onChange={(e) =>
              set("paymentTerm", e.target.value as OrderInput["paymentTerm"])
            }
          >
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Transport *">
          <select
            className={inputCls}
            value={values.transportType}
            onChange={(e) =>
              set(
                "transportType",
                e.target.value as OrderInput["transportType"]
              )
            }
          >
            {TRANSPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Expected delivery">
          <input
            className={inputCls}
            type="date"
            value={values.expectedDeliveryDate ?? ""}
            onChange={(e) => set("expectedDeliveryDate", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className={inputCls}
          rows={3}
          value={values.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={2000}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending} className={btnPrimaryCls}>
        {isPending && <Loader2 size={16} className="animate-spin" />}
        Create order
      </button>
    </form>
  );
}
