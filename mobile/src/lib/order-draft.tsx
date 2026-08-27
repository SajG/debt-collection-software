import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  PaymentTerm,
  QuantityUnit,
  TransportType,
} from "./database.types";

// v2 draft. Header fields stay flat; every SKU on the order lives in
// `items[]`. Cart-first flow — screen 2 in the wizard is a repeatable
// item list, not a linear step chain.
//
// Migration:
//   v1 (order-draft-v1) was a flat 13-column blob (one SKU). If a
//   salesperson had a v1 draft mid-order when the app updated, we
//   convert it to a v2 draft with exactly one item so no typing is
//   lost. See `migrateV1ToV2` below.

const KEY = "order-draft-v2";
const LEGACY_KEY = "order-draft-v1";

export type OrderDraftItem = {
  /** Local id so items can be edited/removed before submission. */
  localId: string;
  brand: string | null;
  productId: string | null;
  productName: string | null;
  /** Empty when the product isn't in the catalogue — submitted as
   *  newProductName on the RPC, server creates a stub. */
  customProductName: string | null;
  quantity: string;
  quantityUnit: QuantityUnit;
  packingType: string | null;
  sizeKg: string | null;
  productRate: string;
};

export type OrderDraft = {
  // ── Header (screen 1) ─────────────────────────────────────────────
  partyId: string | null;
  partyName: string | null;
  newCustomerName: string | null;
  dispatchLocation: string;
  paymentTerm: PaymentTerm | null;
  transportType: TransportType | null;
  expectedDeliveryDate: string | null; // yyyy-mm-dd
  tokenType: string | null;
  notes: string;
  // ── Pricing (screen 3) ────────────────────────────────────────────
  /** Cash discount as a percentage of subtotal (e.g. "2", "3"). Empty
   *  string = 0. Applied to subtotal, then GST is computed on the
   *  discounted taxable amount. */
  discountPct: string;
  /** GST percentage. Default 18. Kept editable in case of future
   *  slab changes or exempt lines. */
  gstPct: string;
  // ── Items (screen 2) ──────────────────────────────────────────────
  items: OrderDraftItem[];
  // ── Wizard bookkeeping ────────────────────────────────────────────
  /** Sticky brand/packing/unit for the NEXT item added — the second
   *  SKU on an order is usually the same brand and pack size. */
  stickyBrand: string | null;
  stickyPacking: string | null;
  stickySize: string | null;
  stickyUnit: QuantityUnit;
};

function newItemId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function emptyItem(): OrderDraftItem {
  return {
    localId: newItemId(),
    brand: null,
    productId: null,
    productName: null,
    customProductName: null,
    quantity: "",
    quantityUnit: "KG",
    packingType: null,
    sizeKg: null,
    productRate: "",
  };
}

export function emptyDraft(): OrderDraft {
  return {
    partyId: null,
    partyName: null,
    newCustomerName: null,
    dispatchLocation: "",
    paymentTerm: null,
    transportType: null,
    expectedDeliveryDate: null,
    tokenType: null,
    notes: "",
    discountPct: "",
    gstPct: "18",
    items: [],
    stickyBrand: null,
    stickyPacking: null,
    stickySize: null,
    stickyUnit: "KG",
  };
}

/** Convert a v1 draft blob into a v2 draft. Called once on hydrate. */
function migrateV1ToV2(raw: unknown): OrderDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = emptyDraft();
  const merged: OrderDraft = {
    ...base,
    partyId: (r.partyId as string | null) ?? null,
    partyName: (r.partyName as string | null) ?? null,
    newCustomerName: (r.newCustomerName as string | null) ?? null,
    dispatchLocation: (r.dispatchLocation as string) ?? "",
    paymentTerm: (r.paymentTerm as PaymentTerm | null) ?? null,
    transportType: (r.transportType as TransportType | null) ?? null,
    expectedDeliveryDate: (r.expectedDeliveryDate as string | null) ?? null,
    tokenType: (r.tokenType as string | null) ?? null,
    notes: (r.notes as string) ?? "",
    stickyBrand: (r.brand as string | null) ?? null,
    stickyPacking: (r.packingType as string | null) ?? null,
    stickySize: (r.sizeKg as string | null) ?? null,
    stickyUnit: (r.quantityUnit as QuantityUnit) ?? "KG",
    items: [],
  };
  // Only lift the SKU into an item if the salesperson actually typed
  // something for it — otherwise we'd produce a phantom empty line.
  const hasSku =
    r.brand ||
    r.productId ||
    r.productName ||
    r.customProductName ||
    (typeof r.quantity === "string" && r.quantity) ||
    (typeof r.productRate === "string" && r.productRate.trim()) ||
    r.packingType ||
    r.sizeKg;
  if (hasSku) {
    merged.items = [
      {
        localId: newItemId(),
        brand: (r.brand as string | null) ?? null,
        productId: (r.productId as string | null) ?? null,
        productName: (r.productName as string | null) ?? null,
        customProductName: (r.customProductName as string | null) ?? null,
        quantity: (r.quantity as string) ?? "",
        quantityUnit: (r.quantityUnit as QuantityUnit) ?? "KG",
        packingType: (r.packingType as string | null) ?? null,
        sizeKg: (r.sizeKg as string | null) ?? null,
        productRate: (r.productRate as string) ?? "",
      },
    ];
  }
  return merged;
}

function isHeaderComplete(d: OrderDraft): boolean {
  return Boolean(
    (d.partyId || d.newCustomerName) &&
      d.dispatchLocation.trim() &&
      d.paymentTerm &&
      d.transportType &&
      d.expectedDeliveryDate &&
      d.tokenType,
  );
}

function isItemComplete(it: OrderDraftItem): boolean {
  return Boolean(
    it.brand &&
      (it.productId || (it.customProductName && it.customProductName.trim())) &&
      Number(it.quantity) > 0 &&
      it.packingType &&
      it.sizeKg &&
      it.productRate.trim(),
  );
}

export function isDraftDirty(d: OrderDraft): boolean {
  if (
    d.partyId ||
    d.newCustomerName ||
    d.dispatchLocation.trim() ||
    d.paymentTerm ||
    d.transportType ||
    d.tokenType ||
    d.notes.trim() ||
    d.items.length > 0
  ) {
    return true;
  }
  return false;
}

export function isDraftComplete(d: OrderDraft): boolean {
  return (
    isHeaderComplete(d) && d.items.length >= 1 && d.items.every(isItemComplete)
  );
}

export function draftTotal(d: OrderDraft): number {
  let total = 0;
  for (const it of d.items) {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.productRate.replace(/[₹,\s]/g, "")) || 0;
    total += qty * rate;
  }
  return Math.round(total * 100) / 100;
}

export type DraftBreakdown = {
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxable: number;
  gstPct: number;
  gstAmount: number;
  grandTotal: number;
};

function clampPct(v: string, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n > 100) return 100;
  return n;
}

/** Money breakdown for the review screen and any downstream reader.
 *  Half-away-from-zero rounding at every step so what the salesperson
 *  sees on screen exactly matches what the server persists. */
export function draftBreakdown(d: OrderDraft): DraftBreakdown {
  const subtotal = draftTotal(d);
  const discountPct = clampPct(d.discountPct, 0);
  const discountAmount = Math.round(subtotal * discountPct) / 100;
  const taxable = Math.round((subtotal - discountAmount) * 100) / 100;
  const gstPct = clampPct(d.gstPct, 18);
  const gstAmount = Math.round(taxable * gstPct) / 100;
  const grandTotal = Math.round((taxable + gstAmount) * 100) / 100;
  return {
    subtotal,
    discountPct,
    discountAmount,
    taxable,
    gstPct,
    gstAmount,
    grandTotal,
  };
}

// ── Provider ────────────────────────────────────────────────────────

type WizardValue = {
  draft: OrderDraft;
  hydrated: boolean;
  setField: <K extends keyof OrderDraft>(k: K, v: OrderDraft[K]) => void;
  patch: (p: Partial<OrderDraft>) => void;
  addItem: (it: Omit<OrderDraftItem, "localId">) => void;
  updateItem: (localId: string, patch: Partial<OrderDraftItem>) => void;
  removeItem: (localId: string) => void;
  replaceDraft: (next: OrderDraft) => void;
  discard: () => Promise<void>;
};

const WizardContext = createContext<WizardValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (mounted) setDraft({ ...emptyDraft(), ...parsed });
        } else {
          // No v2 draft — check for a v1 draft to migrate. Salespeople
          // upgrading mid-order must not lose their typing.
          const legacy = await AsyncStorage.getItem(LEGACY_KEY);
          if (legacy) {
            try {
              const migrated = migrateV1ToV2(JSON.parse(legacy));
              if (migrated && mounted) setDraft(migrated);
            } catch {
              /* corrupt legacy — ignore */
            }
            await AsyncStorage.removeItem(LEGACY_KEY);
          }
        }
      } catch {
        /* corrupt v2 — start fresh */
      }
      if (mounted) setHydrated(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(draft)).catch(() => {
        /* storage full — non-fatal */
      });
    }, 150);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [draft, hydrated]);

  const setField = useCallback<WizardValue["setField"]>((k, v) => {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }, []);

  const patch = useCallback<WizardValue["patch"]>((p) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const addItem = useCallback<WizardValue["addItem"]>((it) => {
    setDraft((prev) => ({
      ...prev,
      items: [...prev.items, { ...it, localId: newItemId() }],
      // Update stickies from the item just added — next Add opens with
      // these prefilled.
      stickyBrand: it.brand,
      stickyPacking: it.packingType,
      stickySize: it.sizeKg,
      stickyUnit: it.quantityUnit,
    }));
  }, []);

  const updateItem = useCallback<WizardValue["updateItem"]>((localId, p) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((x) =>
        x.localId === localId ? { ...x, ...p } : x,
      ),
    }));
  }, []);

  const removeItem = useCallback<WizardValue["removeItem"]>((localId) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((x) => x.localId !== localId),
    }));
  }, []);

  const replaceDraft = useCallback<WizardValue["replaceDraft"]>((next) => {
    setDraft(next);
  }, []);

  const discard = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    setDraft(emptyDraft());
  }, []);

  const value = useMemo<WizardValue>(
    () => ({
      draft,
      hydrated,
      setField,
      patch,
      addItem,
      updateItem,
      removeItem,
      replaceDraft,
      discard,
    }),
    [draft, hydrated, setField, patch, addItem, updateItem, removeItem, replaceDraft, discard],
  );

  return (
    <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
  );
}

export function useWizard(): WizardValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside WizardProvider");
  return ctx;
}

// ── Home-screen preview (outside provider) ──────────────────────────

export function useDraftPreview() {
  const [state, setState] = useState<{
    hydrated: boolean;
    hasDraft: boolean;
    itemCount: number;
    summary: string | null;
  }>({ hydrated: false, hasDraft: false, itemCount: 0, summary: null });

  const refresh = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      let d: OrderDraft | null = null;
      if (raw) {
        d = { ...emptyDraft(), ...JSON.parse(raw) };
      } else {
        const legacy = await AsyncStorage.getItem(LEGACY_KEY);
        if (legacy) d = migrateV1ToV2(JSON.parse(legacy));
      }
      if (!d || !isDraftDirty(d)) {
        setState({ hydrated: true, hasDraft: false, itemCount: 0, summary: null });
        return;
      }
      const summary =
        d.partyName || d.newCustomerName || d.items[0]?.productName || null;
      setState({
        hydrated: true,
        hasDraft: true,
        itemCount: d.items.length,
        summary,
      });
    } catch {
      setState({ hydrated: true, hasDraft: false, itemCount: 0, summary: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}

// ── Repeat-last-order helper ────────────────────────────────────────

export type RepeatSeed = {
  header: Partial<
    Pick<
      OrderDraft,
      | "partyId"
      | "partyName"
      | "newCustomerName"
      | "dispatchLocation"
      | "paymentTerm"
      | "transportType"
      | "tokenType"
    >
  >;
  items: Omit<OrderDraftItem, "localId">[];
};

/** Merge a repeat-seed into an empty draft. Intended flow: home-screen
 *  "Repeat" tap → build seed → write directly to the v2 key → route to
 *  the wizard entry, which hydrates the draft on mount. */
export async function writeRepeatSeed(seed: RepeatSeed): Promise<void> {
  const base = emptyDraft();
  const next: OrderDraft = {
    ...base,
    ...seed.header,
    items: seed.items.map((it) => ({ ...it, localId: newItemId() })),
    stickyBrand: seed.items[0]?.brand ?? null,
    stickyPacking: seed.items[0]?.packingType ?? null,
    stickySize: seed.items[0]?.sizeKg ?? null,
    stickyUnit: seed.items[0]?.quantityUnit ?? "KG",
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}
