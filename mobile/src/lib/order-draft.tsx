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

// The single wizard state. Every step reads and writes here; the whole
// thing is persisted to AsyncStorage on every change so the OS killing
// the app mid-order (memory pressure, phone call interrupt, backgrounded
// for 20 min) doesn't lose the salesperson's typing.

const KEY = "order-draft-v1";

export type OrderDraft = {
  partyId: string | null;
  partyName: string | null;
  // When the customer isn't in the Tally ledger yet, the salesperson types
  // the name and we submit it as newCustomerName. Reconciled to a real
  // Party later once Tally sync brings the ledger entry in.
  newCustomerName: string | null;
  // Free text — the address to dispatch goods to (may differ from ledger).
  dispatchLocation: string;
  brand: string | null;
  productId: string | null;
  productName: string | null;
  quantity: string; // stringy so users can clear it back to empty
  quantityUnit: QuantityUnit;
  packingType: string | null;
  sizeKg: string | null;
  productRate: string;
  paymentTerm: PaymentTerm | null;
  transportType: TransportType | null;
  expectedDeliveryDate: string | null; // yyyy-mm-dd
  // "With Synergy Barcode Token" etc., or a user-typed value via "Other".
  tokenType: string | null;
  notes: string;
  // When the product isn't in the Tally BOM catalogue yet, salesperson
  // types a name. Submitted alongside p_new_product_name; server creates
  // a stub Product row on first save.
  customProductName: string | null;
  // Highest step index visited. Powers "Resume order" on home screen.
  lastStep: number;
};

export function emptyDraft(): OrderDraft {
  return {
    partyId: null,
    partyName: null,
    newCustomerName: null,
    dispatchLocation: "",
    brand: null,
    productId: null,
    productName: null,
    quantity: "",
    quantityUnit: "KG",
    packingType: null,
    sizeKg: null,
    productRate: "",
    paymentTerm: null,
    transportType: null,
    expectedDeliveryDate: null,
    tokenType: null,
    notes: "",
    customProductName: null,
    lastStep: 1,
  };
}

/** True when the salesperson has typed anything into the current draft. */
export function isDraftDirty(d: OrderDraft): boolean {
  return Boolean(
    d.partyId ||
      d.newCustomerName ||
      d.dispatchLocation.trim() ||
      d.brand ||
      d.productId ||
      d.productName ||
      d.customProductName ||
      d.quantity ||
      d.packingType ||
      d.sizeKg ||
      d.productRate.trim() ||
      d.paymentTerm ||
      d.transportType ||
      d.tokenType ||
      d.notes.trim(),
  );
}

/** True once every required field has a value — controls the review step. */
export function isDraftComplete(d: OrderDraft): boolean {
  return Boolean(
    (d.partyId || d.newCustomerName) &&
      d.dispatchLocation.trim() &&
      d.brand &&
      d.productId &&
      Number(d.quantity) > 0 &&
      d.packingType &&
      d.sizeKg &&
      d.productRate.trim() &&
      d.paymentTerm &&
      d.transportType &&
      d.expectedDeliveryDate &&
      d.tokenType,
  );
}

type WizardValue = {
  draft: OrderDraft;
  hydrated: boolean;
  setField: <K extends keyof OrderDraft>(k: K, v: OrderDraft[K]) => void;
  patch: (p: Partial<OrderDraft>) => void;
  discard: () => Promise<void>;
};

const WizardContext = createContext<WizardValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  // Debounce writes to AsyncStorage — one per tick is plenty and avoids
  // hammering the disk while the user is typing in a text field.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!mounted) return;
      if (raw) {
        try {
          setDraft({ ...emptyDraft(), ...JSON.parse(raw) });
        } catch {
          /* corrupt draft — ignore, start fresh */
        }
      }
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(draft)).catch(() => {
        // Storage full or SecureStore quota — non-fatal; user can still
        // finish the order and it'll queue in RAM. Warned in the console.
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

  const discard = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    setDraft(emptyDraft());
  }, []);

  const value = useMemo<WizardValue>(
    () => ({ draft, hydrated, setField, patch, discard }),
    [draft, hydrated, setField, patch, discard],
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

// Home screen preview of the in-progress draft. Reads AsyncStorage
// directly so the home screen (outside WizardProvider) can offer a
// "Resume order" card without duplicating provider state.
export function useDraftPreview() {
  const [state, setState] = useState<{
    hydrated: boolean;
    hasDraft: boolean;
    lastStep: number;
    summary: string | null;
  }>({ hydrated: false, hasDraft: false, lastStep: 1, summary: null });

  const refresh = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) {
        setState({ hydrated: true, hasDraft: false, lastStep: 1, summary: null });
        return;
      }
      const d: OrderDraft = { ...emptyDraft(), ...JSON.parse(raw) };
      const dirty = isDraftDirty(d);
      const summary =
        d.partyName ||
        d.newCustomerName ||
        d.productName ||
        d.customProductName ||
        d.brand ||
        null;
      setState({
        hydrated: true,
        hasDraft: dirty,
        lastStep: d.lastStep || 1,
        summary,
      });
    } catch {
      setState({ hydrated: true, hasDraft: false, lastStep: 1, summary: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
