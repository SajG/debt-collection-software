import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Database, OrderStatus } from "./database.types";

// Plain-hooks data layer. Every hook returns { data, loading, error, refetch }
// so the screens can stay small. When we outgrow this, drop-in TanStack
// Query without changing call sites too much.

type Fetcher<T> = () => Promise<T>;

function useQuery<T>(
  key: string,
  fetcher: Fetcher<T>,
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const run = useCallback(async () => {
    const v = ++versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (versionRef.current !== v) return; // stale
      setData(result);
    } catch (e) {
      if (versionRef.current !== v) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (versionRef.current === v) setLoading(false);
    }
    // fetcher intentionally captured by ref via key — refetch on key change.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, refetch: run };
}

// ── Orders (home list) ─────────────────────────────────────────────

export type OrderListRow = Pick<
  Database["public"]["Tables"]["SalesOrder"]["Row"],
  | "id"
  | "orderNumber"
  | "currentStatus"
  | "quantity"
  | "quantityUnit"
  | "expectedDeliveryDate"
  | "createdAt"
  | "brand"
> & {
  party: { id: string; name: string } | null;
  product: { name: string; brand: string | null } | null;
  salesperson: { id: string; ownerName: string } | null;
};

export function useOwnOrders(
  filter: "all" | "waiting" | "active" | "dispatched",
  scope: "mine" | "all",
  userId: string | null,
) {
  // Include scope + userId in the cache key so switching the toggle
  // triggers a refetch rather than showing stale data.
  const key = `orders:${filter}:${scope}:${userId ?? ""}`;
  return useQuery<OrderListRow[]>(key, async () => {
    let q = supabase
      .from("SalesOrder")
      .select(
        `id, orderNumber, currentStatus, quantity, quantityUnit,
         expectedDeliveryDate, createdAt, brand,
         party:Party!SalesOrder_partyId_fkey(id, name),
         product:Product!SalesOrder_productId_fkey(name, brand),
         salesperson:Profile!SalesOrder_salespersonId_fkey(id, ownerName)`,
      )
      .order("createdAt", { ascending: false })
      .limit(200);

    // scope=mine: filter to own rows in the query. STAFF's RLS already
    // does this, but adding it explicitly makes ADMIN's "My orders" work
    // (and helps the query planner in both cases).
    if (scope === "mine" && userId) {
      q = q.eq("salespersonId", userId);
    }

    if (filter === "waiting") {
      q = q.eq("currentStatus", "PENDING_APPROVAL" satisfies OrderStatus);
    } else if (filter === "active") {
      q = q.in("currentStatus", [
        "ORDER_PLACED",
        "IN_PRODUCTION",
        "READY_TO_DISPATCH",
        "LR_GENERATED",
      ] satisfies OrderStatus[]);
    } else if (filter === "dispatched") {
      q = q.eq("currentStatus", "DISPATCHED" satisfies OrderStatus);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as OrderListRow[];
  });
}

// ── Order detail + timeline ────────────────────────────────────────

export type OrderDetail =
  Database["public"]["Tables"]["SalesOrder"]["Row"] & {
    party: { id: string; name: string } | null;
    product: { name: string; brand: string | null } | null;
    salesperson: { ownerName: string } | null;
    events: {
      id: string;
      status: OrderStatus;
      notes: string | null;
      createdAt: string;
      updatedBy: { ownerName: string } | null;
    }[];
  };

export function useOrderDetail(id: string | null) {
  return useQuery<OrderDetail | null>(`order:${id ?? ""}`, async () => {
    if (!id) return null;
    const { data, error } = await supabase
      .from("SalesOrder")
      .select(
        `*,
         party:Party!SalesOrder_partyId_fkey(id, name),
         product:Product!SalesOrder_productId_fkey(name, brand),
         salesperson:Profile!SalesOrder_salespersonId_fkey(ownerName),
         events:OrderStatusEvent!OrderStatusEvent_salesOrderId_fkey(
           id, status, notes, createdAt,
           updatedBy:Profile!OrderStatusEvent_updatedById_fkey(ownerName)
         )`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // Order events oldest → newest for the timeline. The Supabase query
    // builder erases the joined shape (opaque select string), so we cast
    // via OrderDetail on the way out.
    const detail = data as unknown as OrderDetail;
    return {
      ...detail,
      events: [...(detail.events ?? [])].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    };
  });
}

// ── Parties (customer picker + dues search) ────────────────────────

export type PartyRow = Pick<
  Database["public"]["Tables"]["Party"]["Row"],
  "id" | "name" | "city"
>;

export function useParties(search: string) {
  const key = `parties:${search.trim().toLowerCase()}`;
  return useQuery<PartyRow[]>(key, async () => {
    let q = supabase
      .from("Party")
      .select("id, name, city")
      .eq("isActive", true)
      .order("name", { ascending: true })
      .limit(200);
    const trimmed = search.trim();
    if (trimmed) q = q.ilike("name", `%${trimmed}%`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PartyRow[];
  });
}

// ── Products (brand tiles + brand-filtered product picker) ─────────

export type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  sortOrder: number;
};

export function useProducts() {
  return useQuery<ProductRow[]>("products", async () => {
    const { data, error } = await supabase
      .from("Product")
      .select("id, name, brand, sortOrder")
      .eq("isActive", true)
      .order("brand", { ascending: true })
      .order("sortOrder", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProductRow[];
  });
}

// ── Dues for a customer ────────────────────────────────────────────

export type InvoiceDue = {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  // Decimal columns come back as `number` from supabase-js; consumers
  // already wrap with Number() defensively so widening is safe.
  totalAmount: string | number;
  paidAmount: string | number;
  creditedAmount: string | number;
  status: string;
};

export function useDuesForParty(partyId: string | null) {
  return useQuery<InvoiceDue[]>(`dues:${partyId ?? ""}`, async () => {
    if (!partyId) return [];
    const { data, error } = await supabase
      .from("Invoice")
      .select(
        "id, invoiceNumber, dueDate, totalAmount, paidAmount, creditedAmount, status",
      )
      .eq("partyId", partyId)
      .in("status", ["UNPAID", "PARTIAL", "OVERDUE"])
      .order("dueDate", { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as InvoiceDue[];
  });
}

// ── Last Tally sync — so we can label the dues page accurately ─────

export function useLatestTallySync() {
  return useQuery<{ completedAt: string | null }>(
    "sync:invoices",
    async () => {
      const { data, error } = await supabase
        .from("SyncLog")
        .select("completedAt")
        .in("syncType", ["IMPORT_INVOICES", "FULL_IMPORT"])
        .eq("status", "COMPLETED")
        .order("completedAt", { ascending: false })
        .limit(1)
        .maybeSingle();
      // SyncLog isn't in our hand-authored types; be lenient on the shape.
      if (error) return { completedAt: null };
      return { completedAt: (data as { completedAt: string | null } | null)?.completedAt ?? null };
    },
  );
}

// ── Real-time subscription helper — re-run a callback whenever an
//    OrderStatusEvent lands. RLS scopes the payload to this user's own
//    orders automatically. ────────────────────────────────────────

export function useOrderEventStream(onEvent: () => void, salespersonId: string | null) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!salespersonId) return;
    // Unique per mount so a second mount (StrictMode double-invoke,
    // fast navigation) does NOT hit supabase's cached channel and try
    // to call `.on()` after `.subscribe()` — that path throws
    // "cannot add postgres_changes callbacks after subscribe()".
    const channelName = `order-events:${salespersonId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(channelName);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "OrderStatusEvent",
      },
      () => cbRef.current(),
    );
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "SalesOrder",
      },
      () => cbRef.current(),
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [salespersonId]);
}

// ── Result of the create RPC ───────────────────────────────────────

export type CreateOrderResult = { id: string; orderNumber: string };

export function createOrderRpcArgs(draft: {
  partyId: string | null;
  newCustomerName: string | null;
  dispatchLocation: string | null;
  productId: string;
  brand: string | null;
  quantity: number;
  quantityUnit: string;
  packingType: string;
  sizeKg: string;
  productRate: string;
  paymentTerm: string;
  transportType: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
}) {
  return {
    p_party_id: draft.partyId,
    p_new_customer_name: draft.newCustomerName,
    p_dispatch_location: draft.dispatchLocation,
    p_product_id: draft.productId,
    p_brand: draft.brand,
    p_quantity: draft.quantity,
    p_quantity_unit: draft.quantityUnit,
    p_packing_type: draft.packingType,
    p_size_kg: draft.sizeKg,
    p_product_rate: draft.productRate,
    p_payment_term: draft.paymentTerm,
    p_transport_type: draft.transportType,
    p_expected_delivery_date: draft.expectedDeliveryDate,
    p_token_type: null,
    p_notes: draft.notes,
  };
}
