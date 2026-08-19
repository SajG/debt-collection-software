import AsyncStorage from "@react-native-async-storage/async-storage";
// Legacy FileSystem API — same choice as uploads.ts. Swap when the
// new File/Directory API in SDK 54+ gains replacements for copyAsync /
// makeDirectoryAsync.
import * as FileSystem from "expo-file-system/legacy";
import { useSyncExternalStore } from "react";
import { attachOrderDocument, type OrderDocType } from "./order-doc-queries";

// Offline queue for OrderDocument uploads. Mirrors the shape of
// order-queue.ts (AsyncStorage-backed index, drainOnce, useSync…-based
// hook) but with one important difference: the file itself is copied
// out of the OS-managed camera cache into documentDirectory before we
// enqueue. Without that copy the cache can be purged (photos rotated
// out on low storage, phone reboot) and the enqueued URI would point
// to nothing. The AsyncStorage row only stores the destination path +
// metadata, keeping JSON tiny.

const KEY = "order-doc-queue-v1";
const DIR = `${FileSystem.documentDirectory ?? ""}order-doc-queue/`;

export type QueuedDoc = {
  localId: string;
  orderId: string;
  type: OrderDocType;
  /** Absolute file:// path inside documentDirectory. Deleted on success. */
  localPath: string;
  fileName: string | null;
  mimeType: string | null;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};

let cache: QueuedDoc[] | null = null;
const listeners = new Set<() => void>();

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
}

async function readAll(): Promise<QueuedDoc[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  cache = raw ? (JSON.parse(raw) as QueuedDoc[]) : [];
  return cache;
}

async function persist(next: QueuedDoc[]): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  for (const l of listeners) l();
}

function localUuid(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
  );
}

function extOf(sourceUri: string, fileName: string | null): string {
  const raw =
    fileName?.split(".").pop() ?? sourceUri.split(".").pop() ?? "jpg";
  return raw.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "jpg";
}

export async function enqueueDocument(input: {
  orderId: string;
  type: OrderDocType;
  sourceUri: string;
  fileName: string | null;
  mimeType: string | null;
}): Promise<QueuedDoc> {
  await ensureDir();
  const id = localUuid();
  const dest = `${DIR}${id}.${extOf(input.sourceUri, input.fileName)}`;
  await FileSystem.copyAsync({ from: input.sourceUri, to: dest });
  const q = await readAll();
  const entry: QueuedDoc = {
    localId: id,
    orderId: input.orderId,
    type: input.type,
    localPath: dest,
    fileName: input.fileName,
    mimeType: input.mimeType,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  await persist([...q, entry]);
  return entry;
}

async function removeQueued(localId: string): Promise<void> {
  const q = await readAll();
  const entry = q.find((x) => x.localId === localId);
  if (entry) {
    try {
      await FileSystem.deleteAsync(entry.localPath, { idempotent: true });
    } catch {
      /* file already gone — non-fatal */
    }
  }
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

// MUST return a stable reference across calls when the underlying
// data hasn't changed, or useSyncExternalStore hits
// "The result of getSnapshot should be cached to avoid an infinite loop".
// Fresh `[]` per call was the bug — cache the empty snapshot too.
const EMPTY_SNAPSHOT: QueuedDoc[] = [];
function getSnapshot(): QueuedDoc[] {
  return cache ?? EMPTY_SNAPSHOT;
}

/** React hook — re-renders on every doc queue change. */
export function useDocQueue(): QueuedDoc[] {
  if (cache === null) {
    void readAll().then(() => {
      for (const l of listeners) l();
    });
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Attempt every queued document once. Stops on the first failure so a
 *  bad payload (e.g. RLS deny) doesn't tight-loop; the next drainer
 *  tick will retry on connectivity return or foreground. */
export async function drainDocsOnce(): Promise<{
  sent: number;
  failed: number;
}> {
  const q = await readAll();
  if (q.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const entry of q) {
    try {
      const res = await attachOrderDocument({
        orderId: entry.orderId,
        type: entry.type,
        localUri: entry.localPath,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
      });
      if ("error" in res) throw new Error(res.error);
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
