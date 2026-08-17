import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type StockRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  closingQty: number;
  lastSyncedAt: string | null;
};

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

function useQuery<T>(key: string, fetcher: () => Promise<T>): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);

  const run = useCallback(async () => {
    const v = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (version.current === v) setData(result);
    } catch (e) {
      if (version.current === v) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (version.current === v) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, refetch: run };
}

// ── Party credit — used by the order review step ───────────────────

export type PartyCredit = {
  totalOutstanding: number;
  creditLimit: number | null;
  creditDays: number | null;
};

export function usePartyCredit(partyId: string | null) {
  return useQuery<PartyCredit | null>(
    `party-credit:${partyId ?? ""}`,
    async () => {
      if (!partyId) return null;
      const { data, error } = await (supabase as any)
        .from("Party")
        .select("totalOutstanding, creditLimit, creditDays")
        .eq("id", partyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as {
        totalOutstanding: string | number;
        creditLimit: string | number | null;
        creditDays: number | null;
      };
      return {
        totalOutstanding: Number(row.totalOutstanding),
        creditLimit: row.creditLimit == null ? null : Number(row.creditLimit),
        creditDays: row.creditDays,
      };
    }
  );
}

export function useStock(search: string) {
  const trimmed = search.trim();
  const key = `stock:${trimmed.toLowerCase()}`;
  return useQuery<StockRow[]>(key, async () => {
    let q = supabase
      .from("StockItem")
      .select("id, name, category, unit, closingQty, lastSyncedAt")
      .order("category", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .limit(500);
    if (trimmed) {
      q = q.or(
        `name.ilike.%${trimmed}%,category.ilike.%${trimmed}%`
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      unit: r.unit,
      closingQty: Number(r.closingQty),
      lastSyncedAt: r.lastSyncedAt,
    }));
  });
}
