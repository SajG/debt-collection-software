import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Role } from "./database.types";

// OrderComment fetch + post. RLS enforces read/write scope
// (STAFF own-orders only, FACTORY + ADMIN all). Append-only.

export type OrderCommentRow = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; ownerName: string; role: Role } | null;
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

export function useOrderComments(orderId: string | null) {
  return useQuery<OrderCommentRow[]>(
    `order-comments:${orderId ?? ""}`,
    async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("OrderComment")
        .select(
          `id, body, createdAt,
           author:Profile!OrderComment_authorId_fkey(id, ownerName, role)`,
        )
        .eq("salesOrderId", orderId)
        .order("createdAt", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        id: d.id,
        body: d.body,
        createdAt: d.createdAt,
        author: d.author
          ? {
              id: d.author.id,
              ownerName: d.author.ownerName,
              role: d.author.role,
            }
          : null,
      }));
    },
  );
}

export async function postOrderComment(input: {
  orderId: string;
  body: string;
}): Promise<{ ok: true } | { error: string }> {
  const trimmed = input.body.trim();
  if (!trimmed) return { error: "Say something before sending." };
  if (trimmed.length > 4000) return { error: "Too long (4000 char max)." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await (supabase as any).from("OrderComment").insert({
    salesOrderId: input.orderId,
    authorId: user.id,
    body: trimmed,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
