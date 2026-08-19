import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type {
  OrderStatus,
  PaymentTerm,
  QuantityUnit,
  TransportType,
} from "./database.types";

// Local queue for orders drafted offline. Each entry survives across app
// launches and OS kills — the "never lose an order because of low signal"
// contract from the brief. Drained by useQueueDrainer() at the app root
// whenever connectivity returns.

const KEY = "order-queue-v1";

/** Exactly the shape the create_sales_order RPC expects.
 *  Kept in its own type so the wizard, the queue, and the drainer stay
 *  aligned when we add or rename a field. */
export type OrderRpcPayload = {
  p_party_id: string | null;
  p_new_customer_name?: string | null;
  p_dispatch_location?: string | null;
  p_product_id: string | null;
  p_new_product_name?: string | null;
  p_brand: string | null;
  p_quantity: number;
  p_quantity_unit: QuantityUnit;
  p_packing_type: string;
  p_size_kg: string;
  p_product_rate: string;
  p_payment_term: PaymentTerm;
  p_transport_type: TransportType;
  p_expected_delivery_date: string | null; // yyyy-mm-dd
  p_token_type: string | null;
  p_notes: string | null;
};

export type QueuedOrder = {
  /** Local id — stable across app launches so the home screen can key
   *  on it while the row is still pending. */
  localId: string;
  payload: OrderRpcPayload;
  /** Snapshot of display info for the pending card in the list. */
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

let cache: QueuedOrder[] | null = null;
const listeners = new Set<() => void>();

async function readAll(): Promise<QueuedOrder[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  cache = raw ? (JSON.parse(raw) as QueuedOrder[]) : [];
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

export async function enqueue(
  payload: OrderRpcPayload,
  display: QueuedOrder["display"],
): Promise<QueuedOrder> {
  const q = await readAll();
  const entry: QueuedOrder = {
    localId: localUuid(),
    payload,
    display,
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
        ? { ...x, lastError: error, attempts: x.attempts + 1 }
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

// MUST return a stable reference across calls when the underlying
// data hasn't changed, or useSyncExternalStore hits
// "The result of getSnapshot should be cached to avoid an infinite loop".
// Fresh `[]` per call was the bug — cache the empty snapshot too.
const EMPTY_SNAPSHOT: QueuedOrder[] = [];
function getSnapshot(): QueuedOrder[] {
  return cache ?? EMPTY_SNAPSHOT;
}

/** React hook — re-renders on every queue change. */
export function useQueue(): QueuedOrder[] {
  if (cache === null) {
    void readAll().then(() => {
      for (const l of listeners) l();
    });
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Attempt every queued order once. Stops on the first failure — a bad
 *  payload shouldn't get retried in a tight loop, and a network blip
 *  will be caught by the next drainer tick anyway. */
export async function drainOnce(): Promise<{ sent: number; failed: number }> {
  const q = await readAll();
  if (q.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const entry of q) {
    try {
      const { error } = await supabase.rpc("create_sales_order", entry.payload);
      if (error) throw new Error(error.message);
      await removeQueued(entry.localId);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await markFailure(entry.localId, message);
      failed++;
      break;
    }
  }

  return { sent, failed };
}
