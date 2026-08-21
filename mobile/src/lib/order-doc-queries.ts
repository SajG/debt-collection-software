import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { ORDER_DOC_BUCKET, uploadLocalFileToBucket } from "./uploads";
import { newId } from "./ids";

// Order documents — mirror of PaymentDocument helpers but scoped to
// SalesOrder. Types not in Database types file; cast at the edges.

export type OrderDocType = "INVOICE" | "LORRY_RECEIPT" | "ORDER_PROOF" | "OTHER";

export const ORDER_DOC_LABELS: Record<OrderDocType, string> = {
  INVOICE: "Invoice",
  LORRY_RECEIPT: "Lorry receipt",
  ORDER_PROOF: "Order proof",
  OTHER: "Other",
};

// Only these can be uploaded by STAFF (matches server-side rule in
// app/(dashboard)/production/actions.ts). Enforced by RLS too.
export const STAFF_UPLOADABLE_TYPES: OrderDocType[] = ["ORDER_PROOF", "OTHER"];

export type OrderDocRow = {
  id: string;
  type: OrderDocType;
  storagePath: string;
  createdAt: string;
  uploadedByName: string | null;
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

export function useOrderDocuments(orderId: string | null) {
  return useQuery<OrderDocRow[]>(`order-docs:${orderId ?? ""}`, async () => {
    if (!orderId) return [];
    const { data, error } = await supabase
      .from("OrderDocument")
      .select(
        `id, type, storagePath, createdAt,
         uploadedBy:Profile!OrderDocument_uploadedById_fkey(ownerName)`
      )
      .eq("salesOrderId", orderId)
      .order("createdAt", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((d: any) => ({
      id: d.id,
      type: d.type as OrderDocType,
      storagePath: d.storagePath,
      createdAt: d.createdAt,
      uploadedByName: d.uploadedBy?.ownerName ?? null,
    }));
  });
}

export async function attachOrderDocument(input: {
  orderId: string;
  type: OrderDocType;
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const uploaded = await uploadLocalFileToBucket({
    bucket: ORDER_DOC_BUCKET,
    scopePrefix: input.orderId,
    uri: input.localUri,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  if ("error" in uploaded) return uploaded;

  const { error } = await supabase.from("OrderDocument").insert({
    id: newId("odoc"),
    salesOrderId: input.orderId,
    type: input.type,
    storagePath: uploaded.path,
    uploadedById: user.id,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
