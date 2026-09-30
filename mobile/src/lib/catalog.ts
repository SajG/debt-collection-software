import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  BRAND_LIST as FALLBACK_BRANDS,
  COMMON_PACKINGS as FALLBACK_PACKINGS,
} from "./constants";

// SY24 — per-organization brand + packing chips.
//
// Falls back to the Synergy-derived starter lists in constants.ts
// when the tenant hasn't customised them. Managed on the web at
// /admin/products; changes propagate on next mount.
//
// One in-memory cache per Supabase session — good enough because
// the list is rarely edited and re-mounting the ItemSheet is the
// cheapest refresh. If you need instant reflect, expose a
// invalidateCatalog() bust and call it from the settings save path.

type OrgCatalog = {
  brands: readonly string[];
  packings: readonly string[];
};

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
    if (error || !data) {
      cache = {
        brands: FALLBACK_BRANDS,
        packings: FALLBACK_PACKINGS,
      };
      return cache;
    }
    const brands = arrayOrFallback(data.brandList, FALLBACK_BRANDS);
    const packings = arrayOrFallback(data.packingList, FALLBACK_PACKINGS);
    cache = { brands, packings };
    return cache;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function arrayOrFallback(
  v: unknown,
  fallback: readonly string[],
): readonly string[] {
  if (!Array.isArray(v)) return fallback;
  const clean = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return clean.length > 0 ? clean : fallback;
}

export function useOrgCatalog(): OrgCatalog {
  const [value, setValue] = useState<OrgCatalog>(
    cache ?? { brands: FALLBACK_BRANDS, packings: FALLBACK_PACKINGS },
  );
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
