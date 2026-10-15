import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// Last catalogue this phone saw, so an order taken offline still gets
// the company's own form (same idea as lock-policy.ts).
const STORAGE_KEY = "syncit:orgCatalog";

// SY24 — per-organization brand + packing chips.
//
// Managed on the web at /admin/products; changes propagate on next
// mount. A company that has not set up brand / packing lists gets
// EMPTY lists (generic order form: brand hidden, packing and size
// optional free text) — never another company's catalogue. Synergy's
// lists live in its own BusinessSettings row (seeded by
// 20260930000000_org_catalogue_and_factory_rates).
//
// One in-memory cache per Supabase session — good enough because
// the list is rarely edited and re-mounting the ItemSheet is the
// cheapest refresh. If you need instant reflect, expose a
// invalidateCatalog() bust and call it from the settings save path.

type OrgCatalog = {
  brands: readonly string[];
  packings: readonly string[];
  /** True when the company has its own brand list. Turns on the
   *  catalogue-style order form (brand, packing and size required,
   *  token/gift chips). False = generic order form for any business. */
  configured: boolean;
};

const EMPTY: OrgCatalog = { brands: [], packings: [], configured: false };

// The cache belongs to one signed-in user in one company: drop it
// whenever the session changes (sign-out, another user, company
// switch refreshes the token's active_org_id).
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
    cache = null;
  }
  if (event === "SIGNED_OUT") {
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  }
});

let cache: OrgCatalog | null = null;
let inflight: Promise<OrgCatalog> | null = null;

async function fetchOnce(): Promise<OrgCatalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await (supabase
      .from("BusinessSettings") as unknown as {
      select: (cols: string) => {
        maybeSingle: () => Promise<{
          data: { brandList: unknown; packingList: unknown } | null;
          error: unknown;
        }>;
      };
    })
      .select("brandList,packingList")
      .maybeSingle();
    if (error) {
      // Offline / transient: use what this phone last saw, and don't
      // cache in memory, so the next mount retries the network.
      return (await readStored()) ?? EMPTY;
    }
    if (!data) {
      // Every company has a settings row, so "no row" means the phone
      // could not read it (e.g. the 20261015 read-policy migration is
      // not applied yet). Same as offline: last known, retry later.
      return (await readStored()) ?? EMPTY;
    }
    const brands = cleanList(data.brandList);
    const packings = cleanList(data.packingList);
    cache = { brands, packings, configured: brands.length > 0 };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => undefined);
    return cache;
  })().catch(async () => (await readStored()) ?? EMPTY);
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function readStored(): Promise<OrgCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<OrgCatalog>;
    const brands = cleanList(v.brands);
    return { brands, packings: cleanList(v.packings), configured: brands.length > 0 };
  } catch {
    return null;
  }
}

function cleanList(v: unknown): readonly string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export function useOrgCatalog(): OrgCatalog {
  const [value, setValue] = useState<OrgCatalog>(cache ?? EMPTY);
  useEffect(() => {
    let cancelled = false;
    void fetchOnce().then((next) => {
      if (!cancelled) setValue(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return value;
}

/** Test / settings hook: drop the cache so the next useOrgCatalog()
 *  re-reads BusinessSettings. */
export function invalidateOrgCatalog(): void {
  cache = null;
}
