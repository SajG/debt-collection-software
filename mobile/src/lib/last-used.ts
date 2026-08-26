import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PaymentTerm, TransportType } from "./database.types";

// Per-customer memory of the last order the salesperson placed for
// them: dispatch location, payment terms, transport, token. Screen 1
// of the wizard pre-fills these when a customer is picked so the
// second-order-onwards ask is roughly "same as last time, right?".
// Not synced anywhere — device-local convenience only.

const KEY = "order-last-used-v1";

export type LastUsedHeader = {
  dispatchLocation?: string;
  paymentTerm?: PaymentTerm;
  transportType?: TransportType;
  tokenType?: string;
};

type Map = Record<string, LastUsedHeader | undefined>;

async function readMap(): Promise<Map> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Map) : {};
  } catch {
    return {};
  }
}

async function writeMap(m: Map): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* non-fatal */
  }
}

export async function getLastUsedFor(
  partyId: string | null,
): Promise<LastUsedHeader | null> {
  if (!partyId) return null;
  const m = await readMap();
  return m[partyId] ?? null;
}

export async function recordLastUsed(
  partyId: string | null,
  header: LastUsedHeader,
): Promise<void> {
  if (!partyId) return;
  const m = await readMap();
  m[partyId] = { ...m[partyId], ...header };
  await writeMap(m);
}
