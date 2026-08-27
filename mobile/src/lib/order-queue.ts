import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { isRetryableRpcError } from "./errors";
import type {
  OrderStatus,
  PaymentTerm,
  QuantityUnit,
  TransportType,
} from "./database.types";

// Local queue for orders drafted offline. Each entry survives across
// app launches and OS kills — the "never lose an order because of low
// signal" contract from the brief. Drained by useQueueDrainer() at the
// app root whenever connectivity returns.
//
// Storage key was bumped v1 → v2 alongside the multi-line rewrite. v1
// entries (single-SKU) are migrated on first read so a salesperson who
// was offline during the app update doesn't lose queued orders.

const KEY = "order-queue-v2";
const LEGACY_KEY = "order-queue-v1";

// Payload for create_sales_order_v2 (jsonb args). Kept as a discriminated
// { header, items } record locally; assembled into `{ p_header, p_items }`
// at RPC time. `readonly` throughout: once enqueued, the object must not
// be mutated. A retry replays the exact bytes the salesperson typed.
export type OrderRpcHeader = {
  partyId: string | null;
  newCustomerName: string | null;
  dispatchLocation: string | null;
  paymentTerm: PaymentTerm;
  transportType: TransportType;
  expectedDeliveryDate: string | null; // yyyy-mm-dd
  tokenType: string | null;
  notes: string | null;
  creditOverrideNote: string | null;
  /** Cash discount % applied to subtotal. 0 when absent. */
  discountPct: number;
  /** GST %. Default 18. */
  gstPct: number;
};

export type OrderRpcItem = {
  productId: string | null;
  newProductName: string | null;
  brand: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  packingType: string;
  sizeKg: string;
  productRate: string;
};

export type OrderRpcPayload = {
  header: OrderRpcHeader;
  items: OrderRpcItem[];
};

export type QueuedOrder = {
  /** Stable local id — survives app launches so the home-screen
   *  optimistic card can key on it while the row is still pending. */
  localId: string;
  /** The exact payload as the salesperson placed it. NEVER mutated in
   *  place; retries pass this object verbatim to the RPC. See the note
   *  in `drainOnce`. */
  payload: OrderRpcPayload;
  /** Snapshot of display info for the pending card in the list. */
  display: {
    partyName: string;
    productName: string;
    brand: string | null;
    itemCount: number;
    totalQuantity: number;
    quantityUnit: QuantityUnit;
    currentStatus: OrderStatus;
  };
  queuedAt: string;
  lastError: string | null;
  attempts: number;
};

let cache: QueuedOrder[] | null = null;
const listeners = new Set<() => void>();

// ── v1 → v2 migration ───────────────────────────────────────────────
// v1 stored { p_party_id, p_product_id, ... } single-SKU kwargs. If a
// user was offline during the app upgrade, we lift each v1 entry to a
// one-item v2 entry so nothing is dropped.
type LegacyV1Entry = {
  localId: string;
  payload: {
    p_party_id: string | null;
    p_new_customer_name?: string | null;
    p_dispatch_location?: string | null;
    p_product_id: string | null;
    p_new_product_name?: string | null;
    p_credit_override_note?: string | null;
    p_brand: string | null;
    p_quantity: number;
    p_quantity_unit: QuantityUnit;
    p_packing_type: string;
    p_size_kg: string;
    p_product_rate: string;
    p_payment_term: PaymentTerm;
    p_transport_type: TransportType;
    p_expected_delivery_date: string | null;
    p_token_type: string | null;
    p_notes: string | null;
  };
  display: {
    partyName: string;
    productName: string;
    brand: string | null;
    quantity: number;
    quantityUnit: QuantityUnit;
    currentStatus: OrderStatus;
  };
  queuedAt: string;
  lastError: string | null;
  attempts: number;
};

function migrateV1Entry(v1: LegacyV1Entry): QueuedOrder {
  return {
    localId: v1.localId,
    payload: {
      header: {
        partyId: v1.payload.p_party_id,
        newCustomerName: v1.payload.p_new_customer_name ?? null,
        dispatchLocation: v1.payload.p_dispatch_location ?? null,
        paymentTerm: v1.payload.p_payment_term,
        transportType: v1.payload.p_transport_type,
        expectedDeliveryDate: v1.payload.p_expected_delivery_date,
        tokenType: v1.payload.p_token_type,
        notes: v1.payload.p_notes,
        creditOverrideNote: v1.payload.p_credit_override_note ?? null,
        // v1 predates discount + GST — default to 0 discount, 18% GST
        // so replayed orders match today's server contract.
        discountPct: 0,
        gstPct: 18,
      },
      items: [
        {
          productId: v1.payload.p_product_id,
          newProductName: v1.payload.p_new_product_name ?? null,
          brand: v1.payload.p_brand ?? "",
          quantity: v1.payload.p_quantity,
          quantityUnit: v1.payload.p_quantity_unit,
          packingType: v1.payload.p_packing_type,
          sizeKg: v1.payload.p_size_kg,
          productRate: v1.payload.p_product_rate,
        },
      ],
    },
    display: {
      partyName: v1.display.partyName,
      productName: v1.display.productName,
      brand: v1.display.brand,
      itemCount: 1,
      totalQuantity: v1.display.quantity,
      quantityUnit: v1.display.quantityUnit,
      currentStatus: v1.display.currentStatus,
    },
    queuedAt: v1.queuedAt,
    lastError: v1.lastError,
    attempts: v1.attempts,
  };
}

async function readAll(): Promise<QueuedOrder[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  if (raw) {
    cache = JSON.parse(raw) as QueuedOrder[];
    return cache;
  }
  // Attempt a v1 migration on first read.
  const legacy = await AsyncStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const rows = JSON.parse(legacy) as LegacyV1Entry[];
      const migrated = rows.map(migrateV1Entry);
      cache = migrated;
      await AsyncStorage.setItem(KEY, JSON.stringify(migrated));
    } catch {
      cache = [];
    }
    await AsyncStorage.removeItem(LEGACY_KEY);
    return cache!;
  }
  cache = [];
  return cache;
}

async function persist(next: QueuedOrder[]): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  for (const l of listeners) l();
}

function localUuid(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
  );
}

/** Deep-clone the payload on the way in so the caller can't mutate
 *  what we stored later. Prevents the "retry replayed a partial
 *  object" class of bug where a downstream normalization step
 *  reassigned a field on the same reference that lives in the queue.
 *  Cheap — the payload is small and only paid once, at enqueue. */
function freezePayload(p: OrderRpcPayload): OrderRpcPayload {
  return JSON.parse(JSON.stringify(p)) as OrderRpcPayload;
}

export async function enqueue(
  payload: OrderRpcPayload,
  display: QueuedOrder["display"],
): Promise<QueuedOrder> {
  const q = await readAll();
  const entry: QueuedOrder = {
    localId: localUuid(),
    payload: freezePayload(payload),
    display: { ...display },
    queuedAt: new Date().toISOString(),
    lastError: null,
    attempts: 0,
  };
  await persist([...q, entry]);
  return entry;
}

export async function removeQueued(localId: string): Promise<void> {
  const q = await readAll();
  await persist(q.filter((x) => x.localId !== localId));
}

export async function markFailure(
  localId: string,
  error: string,
): Promise<void> {
  const q = await readAll();
  await persist(
    q.map((x) =>
      x.localId === localId
        ? {
            ...x,
            // Explicitly re-attach the exact original payload rather
            // than relying on shallow-spread semantics. Belt-and-braces
            // against a future edit accidentally producing a partial
            // rebuild here — every retry MUST see the same bytes the
            // salesperson typed at enqueue time.
            payload: x.payload,
            lastError: error,
            attempts: x.attempts + 1,
          }
        : x,
    ),
  );
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const EMPTY_SNAPSHOT: QueuedOrder[] = [];
function getSnapshot(): QueuedOrder[] {
  return cache ?? EMPTY_SNAPSHOT;
}

export function useQueue(): QueuedOrder[] {
  if (cache === null) {
    void readAll().then(() => {
      for (const l of listeners) l();
    });
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Attempt every queued order once. Stops on the first failure — a
 *  bad payload shouldn't get retried in a tight loop, and a network
 *  blip will be caught by the next drainer tick anyway.
 *
 *  RETRY CONTRACT: every attempt passes `entry.payload` verbatim.
 *  Do NOT rebuild the RPC args from `entry.display` here — that was
 *  the silent-field-loss bug that motivated the queue rewrite. The
 *  display object is for the pending card only. */
export async function drainOnce(): Promise<{ sent: number; failed: number }> {
  const q = await readAll();
  if (q.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const entry of q) {
    try {
      // Assemble the jsonb RPC args from the stored payload. No merging
      // with display, no re-derivation from partial state — just the
      // frozen object that came out of enqueue().
      // Cast because get-generated Database types haven't been regenerated
      // for create_sales_order_v2 yet (added by migration
      // 20260824181000_create_sales_order_v2).
      // Backfill discount/GST defaults for entries that were queued
       // before those fields existed on OrderRpcHeader. The RPC treats
       // missing keys as 0 / 18 anyway; being explicit here documents
       // the retry contract.
      const header = {
        ...entry.payload.header,
        discountPct: entry.payload.header.discountPct ?? 0,
        gstPct: entry.payload.header.gstPct ?? 18,
      };
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>)(
        "create_sales_order_v2",
        { p_header: header, p_items: entry.payload.items },
      );
      if (error) throw new Error(error.message);
      await removeQueued(entry.localId);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!isRetryableRpcError(e)) {
        // App-shape error: the server rejected this payload and no
        // number of retries will change that (missing function on
        // staging, permission denied, credit-limit hard block, ...).
        // Stamp the failure with attempts++ so the chip in the sheet
        // shows the real reason, but do NOT `break` — remove nothing
        // silently. The user must open the sheet and see what went
        // wrong; a subsequent app version + migration is the fix.
        await markFailure(entry.localId, message);
        failed++;
        continue;
      }
      // Retryable: bump attempts and stop the drain pass so a bad
      // network doesn't cascade through the whole queue.
      await markFailure(entry.localId, message);
      failed++;
      break;
    }
  }

  return { sent, failed };
}
