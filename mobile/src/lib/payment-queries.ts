import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import {
  PAYMENT_DOC_BUCKET,
  uploadLocalFileToBucket,
} from "./uploads";

// Reuses the same tiny useQuery pattern as queries.ts. Payment CRUD isn't
// covered by the hand-authored Database types file — we cast at the edges
// and keep the surface narrow.

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

// ── Types (kept narrow — mirror only the columns we render) ────────

export type PaymentMethod = "CASH" | "CHEQUE" | "NEFT" | "RTGS" | "UPI" | "OTHER";

export type PaymentDocType =
  | "BANK_SCREENSHOT"
  | "CHEQUE_PHOTO"
  | "UPI_SCREENSHOT"
  | "RECEIPT"
  | "OTHER";

export const PAYMENT_DOC_LABELS: Record<PaymentDocType, string> = {
  BANK_SCREENSHOT: "Bank screenshot",
  CHEQUE_PHOTO: "Cheque photo",
  UPI_SCREENSHOT: "UPI screenshot",
  RECEIPT: "Signed receipt",
  OTHER: "Other",
};

export type PaymentListRow = {
  id: string;
  partyId: string;
  partyName: string;
  amount: string;
  paymentDate: string;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
  proofCount: number;
};

export type PaymentDetail = PaymentListRow & {
  notes: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  recordedByName: string | null;
  documents: PaymentDocumentRow[];
};

export type PaymentDocumentRow = {
  id: string;
  type: PaymentDocType;
  storagePath: string;
  fileName: string | null;
  notes: string | null;
  createdAt: string;
  uploadedByName: string | null;
};

// ── List — recent payments visible to this user (RLS scoped) ───────

export function usePayments() {
  return useQuery<PaymentListRow[]>("payments:list", async () => {
    const { data, error } = await supabase
      .from("Payment")
      .select(
        `id, partyId, amount, paymentDate, method, reference, createdAt,
         party:Party!inner(name),
         documents:PaymentDocument(id)`
      )
      .order("createdAt", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.id,
      partyId: row.partyId,
      partyName: row.party?.name ?? "Unknown",
      amount: String(row.amount),
      paymentDate: row.paymentDate,
      method: row.method as PaymentMethod,
      reference: row.reference,
      createdAt: row.createdAt,
      proofCount: (row.documents ?? []).length,
    }));
  });
}

export function usePaymentDetail(id: string | null) {
  return useQuery<PaymentDetail | null>(`payment:${id ?? ""}`, async () => {
    if (!id) return null;
    const { data, error } = await supabase
      .from("Payment")
      .select(
        `id, partyId, amount, paymentDate, method, reference, notes, invoiceId, createdAt,
         party:Party!inner(name),
         invoice:Invoice(invoiceNumber),
         recordedBy:Profile!Payment_recordedById_fkey(ownerName),
         documents:PaymentDocument(
           id, type, storagePath, fileName, notes, createdAt,
           uploadedBy:Profile!PaymentDocument_uploadedById_fkey(ownerName)
         )`
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as any;
    const docs: PaymentDocumentRow[] = (row.documents ?? [])
      .map((d: any) => ({
        id: d.id,
        type: d.type as PaymentDocType,
        storagePath: d.storagePath,
        fileName: d.fileName ?? null,
        notes: d.notes ?? null,
        createdAt: d.createdAt,
        uploadedByName: d.uploadedBy?.ownerName ?? null,
      }))
      .sort(
        (a: PaymentDocumentRow, b: PaymentDocumentRow) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    return {
      id: row.id,
      partyId: row.partyId,
      partyName: row.party?.name ?? "Unknown",
      amount: String(row.amount),
      paymentDate: row.paymentDate,
      method: row.method,
      reference: row.reference,
      createdAt: row.createdAt,
      notes: row.notes ?? null,
      invoiceId: row.invoiceId ?? null,
      invoiceNumber: row.invoice?.invoiceNumber ?? null,
      recordedByName: row.recordedBy?.ownerName ?? null,
      proofCount: docs.length,
      documents: docs,
    };
  });
}

// ── Record a new payment ───────────────────────────────────────────

export async function createPayment(input: {
  partyId: string;
  invoiceId: string | null;
  amount: number;
  paymentDate: string; // yyyy-mm-dd
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
}): Promise<{ id: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Direct INSERT — RLS on Payment restricts write to assigned parties.
  // On the invoice-linked path the server needs to also bump Invoice.paidAmount
  // and Party.totalOutstanding; that happens via a Postgres trigger. If the
  // trigger isn't installed yet, values will drift and the web action stays
  // as the safe path.
  const { data, error } = await (supabase as any)
    .from("Payment")
    .insert({
      partyId: input.partyId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      paymentDate: input.paymentDate,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      recordedById: user.id,
      source: "MANUAL",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

// ── Attach a proof photo to a payment ──────────────────────────────

export async function attachPaymentProof(input: {
  paymentId: string;
  type: PaymentDocType;
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
  notes?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const uploaded = await uploadLocalFileToBucket({
    bucket: PAYMENT_DOC_BUCKET,
    scopePrefix: input.paymentId,
    uri: input.localUri,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  if ("error" in uploaded) return uploaded;

  const { error } = await (supabase as any).from("PaymentDocument").insert({
    paymentId: input.paymentId,
    type: input.type,
    storagePath: uploaded.path,
    fileName: input.fileName ?? null,
    uploadedById: user.id,
    notes: input.notes ?? null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
