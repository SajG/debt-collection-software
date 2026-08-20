import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { OrderStatus } from "./database.types";

// Offline queue for FACTORY status-advance taps. Same shape as
// order-queue.ts and order-doc-queue.ts: AsyncStorage-backed index,
// drainOnce entry point, useSyncExternalStore hook.
//
// Payload is small — just the RPC args. The atomic advance_order_status
// RPC (migration 20260821170000) validates the transition again on the
// server, so a stale queued advance (order moved forward while offline)
// fails cleanly with "Cannot advance … backwards or skip" and stays
// queued for the operator to see + retry.

const KEY = "order-status-queue-v1";

export type QueuedStatusAdvance = {
  localId: string;
  orderId: string;
  orderNumber: string;
  target: OrderStatus;
  note: string | null;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};

let cache: QueuedStatusAdvance[] | null = null;
const listeners = new Set<() => void>();

async function readAll(): Promise<QueuedStatusAdvance[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  cache = raw ? (JSON.parse(raw) as QueuedStatusAdvance[]) : [];
  return cache;
}

async function persist(next: QueuedStatusAdvance[]): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  for (const l of listeners) l();
}

function localUuid(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
  );
}

export async function enqueueStatusAdvance(input: {
  orderId: string;
  orderNumber: string;
  target: OrderStatus;
  note: string | null;
}): Promise<QueuedStatusAdvance> {
  const q = await readAll();
  const entry: QueuedStatusAdvance = {
    localId: localUuid(),
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    target: input.target,
    note: input.note,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  await persist([...q, entry]);
  return entry;
}

async function removeQueued(localId: string): Promise<void> {
  const q = await readAll();
  await persist(q.filter((x) => x.localId !== localId));
}

async function markFailure(localId: string, error: string): Promise<void> {
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

// Stable snapshot ref — same reason as order-queue.ts.
const EMPTY_SNAPSHOT: QueuedStatusAdvance[] = [];
function getSnapshot(): QueuedStatusAdvance[] {
  return cache ?? EMPTY_SNAPSHOT;
}

export function useStatusQueue(): QueuedStatusAdvance[] {
  if (cache === null) {
    void readAll().then(() => {
      for (const l of listeners) l();
    });
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Attempt every queued advance once. Stops on the first hard failure
 *  so a stale/invalid advance doesn't tight-loop. Connectivity blips
 *  will be caught by the next drainer tick. */
export async function drainStatusOnce(): Promise<{
  sent: number;
  failed: number;
}> {
  const q = await readAll();
  if (q.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const entry of q) {
    try {
      const { error } = await supabase.rpc("advance_order_status", {
        p_order_id: entry.orderId,
        p_target: entry.target,
        p_note: entry.note,
      });
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

/**
 * Try the advance now; if we're offline (or the RPC network call
 * throws pre-response) enqueue it and return the queued entry so the
 * UI can show a "pending" indicator. Server-side validation is the
 * same in both paths — the RPC re-checks the transition on drain.
 */
export async function submitStatusAdvance(input: {
  orderId: string;
  orderNumber: string;
  target: OrderStatus;
  note: string | null;
  online: boolean;
}): Promise<
  | { ok: true }
  | { queued: true; entry: QueuedStatusAdvance }
  | { error: string }
> {
  if (!input.online) {
    const entry = await enqueueStatusAdvance(input);
    return { queued: true, entry };
  }
  try {
    const { error } = await supabase.rpc("advance_order_status", {
      p_order_id: input.orderId,
      p_target: input.target,
      p_note: input.note,
    });
    if (error) {
      // Network-shaped errors are opaque; queue for retry rather
      // than fail. Application-shaped errors from the RPC (bad
      // transition, unauthorized) return a Postgres error message,
      // which we surface to the user for a fix instead of queuing.
      const message = error.message || "";
      const isAppError =
        /awaiting admin rate approval|cannot advance|cannot cancel|already in status|only FACTORY or ADMIN|not authenticated|account disabled/i.test(
          message,
        );
      if (isAppError) return { error: message };
      const entry = await enqueueStatusAdvance(input);
      return { queued: true, entry };
    }
    return { ok: true };
  } catch (e) {
    const entry = await enqueueStatusAdvance(input);
    return { queued: true, entry };
  }
}
