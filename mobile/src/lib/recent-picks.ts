import AsyncStorage from "@react-native-async-storage/async-storage";

// Recency store for picker fields — small LRU per kind. Keeps the
// "here's the party you were just working with" bump at the top of
// the picker without touching the wire protocol.
//
// Not synced. Cleared on sign-out via clearRecentPicks() so a shared
// phone doesn't leak the last salesperson's recent list.

const KEY_PREFIX = "syncit:recent:";
const MAX_PER_KIND = 10;

export type RecentKind = "product" | "party";

async function read(kind: RecentKind): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + kind);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function write(kind: RecentKind, ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY_PREFIX + kind,
      JSON.stringify(ids.slice(0, MAX_PER_KIND)),
    );
  } catch {
    /* non-fatal */
  }
}

export async function getRecent(kind: RecentKind): Promise<string[]> {
  return read(kind);
}

export async function recordRecent(
  kind: RecentKind,
  id: string,
): Promise<void> {
  if (!id) return;
  const cur = await read(kind);
  const next = [id, ...cur.filter((x) => x !== id)];
  await write(kind, next);
}

export async function clearRecentPicks(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(KEY_PREFIX + "product"),
    AsyncStorage.removeItem(KEY_PREFIX + "party"),
  ]);
}
