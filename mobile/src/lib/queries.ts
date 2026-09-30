import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Database, OrderStatus } from "./database.types";
import { getProfileDirectory, type ProfileDirectoryEntry } from "./profile-directory";
import { handleRevocationError } from "./session-revoked";

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
      // Any RLS-denied / 401 error after an admin revokes the device
      // becomes a hard sign-out + banner (SY15.1 audit follow-up).
      // handleRevocationError returns true when it consumed the
      // error; the root gate will route to /(auth)/email on its
      // own via the auth-state listener.
      if (await handleRevocationError(e)) return;
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
  | "newCustomerName"
> & {
  party: { id: string; name: string } | null;
  product: { name: string; brand: string | null } | null;
  // ownerName + phone are nullable — STAFF callers can't read the
  // directory RPC. Renderers show "Unknown user" and hide the
  // tap-to-call action when phone is null.
  salesperson: {
    id: string;
    ownerName: string | null;
    phone: string | null;
  } | null;
  needsRateApproval: boolean;
  holdReasonCategory: string | null;
  holdReason: string | null;
  itemCount: number;
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
        // NOTE: salesperson is hydrated client-side from
        // get_profile_directory() below. Do NOT re-add a
        // salesperson:Profile!fkey embed here — Profile has RLS that
        // limits SELECT to (id = auth.uid()), so the embed silently
        // returns null for every row you didn't personally place.
        `id, orderNumber, currentStatus, quantity, quantityUnit,
         expectedDeliveryDate, createdAt, brand, salespersonId,
         newCustomerName,
         needsRateApproval, holdReasonCategory, holdReason,
         party:Party!SalesOrder_partyId_fkey(id, name),
         product:Product!SalesOrder_productId_fkey(name, brand),
         items:SalesOrderItem!SalesOrderItem_salesOrderId_fkey(id)`,
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
    const rows = (data ?? []) as unknown as (Omit<
      OrderListRow,
      "salesperson" | "itemCount"
    > & {
      salespersonId: string | null;
      items: { id: string }[] | null;
    })[];
    const dir = await getProfileDirectory();
    return rows.map((r) => {
      const hit: ProfileDirectoryEntry | undefined = r.salespersonId
        ? dir.get(r.salespersonId)
        : undefined;
      return {
        ...r,
        salesperson: r.salespersonId
          ? {
              id: r.salespersonId,
              ownerName: hit?.ownerName ?? null,
              phone: hit?.phone ?? null,
            }
          : null,
        itemCount: r.items?.length ?? 0,
      } as OrderListRow;
    });
  });
}

// ── Order detail + timeline ────────────────────────────────────────

export type LineProductionStatus = "PENDING" | "IN_PRODUCTION" | "READY";

export type OrderDetailItem = {
  id: string;
  lineNumber: number;
  brand: string;
  quantity: number | string;
  quantityUnit: string;
  packingType: string | null;
  sizeKg: string | null;
  productRate: string;
  lineValue: number | string;
  needsRateApproval: boolean;
  productionStatus: LineProductionStatus;
  product: { name: string; brand: string | null } | null;
};

export type OrderDetail =
  Database["public"]["Tables"]["SalesOrder"]["Row"] & {
    party: { id: string; name: string } | null;
    product: { name: string; brand: string | null } | null;
    salesperson: {
      ownerName: string | null;
      phone: string | null;
    } | null;
    items: OrderDetailItem[];
    events: {
      id: string;
      status: OrderStatus;
      notes: string | null;
      createdAt: string;
      updatedById: string | null;
      updatedBy: { ownerName: string | null } | null;
    }[];
  };

export function useOrderDetail(id: string | null) {
  return useQuery<OrderDetail | null>(`order:${id ?? ""}`, async () => {
    if (!id) return null;
    const { data, error } = await supabase
      .from("SalesOrder")
      .select(
        // Profile embeds intentionally removed — RLS on Profile is
        // (id = auth.uid()) so joins silently null out. Names are
        // hydrated below from get_profile_directory().
        `*,
         party:Party!SalesOrder_partyId_fkey(id, name),
         product:Product!SalesOrder_productId_fkey(name, brand),
         items:SalesOrderItem!SalesOrderItem_salesOrderId_fkey(
           id, lineNumber, brand, quantity, quantityUnit,
           packingType, sizeKg, productRate, lineValue,
           needsRateApproval, productionStatus,
           product:Product!SalesOrderItem_productId_fkey(name, brand)
         ),
         events:OrderStatusEvent!OrderStatusEvent_salesOrderId_fkey(
           id, status, notes, createdAt, updatedById
         )`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const raw = data as unknown as Omit<
      OrderDetail,
      "salesperson" | "events" | "items"
    > & {
      salespersonId: string | null;
      items: OrderDetailItem[] | null;
      events: {
        id: string;
        status: OrderStatus;
        notes: string | null;
        createdAt: string;
        updatedById: string | null;
      }[];
    };
    const dir = await getProfileDirectory();
    const hydrateName = (uid: string | null): string | null => {
      if (!uid) return null;
      return dir.get(uid)?.ownerName ?? null;
    };
    const events = [...(raw.events ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((e) => ({
        ...e,
        updatedBy: e.updatedById
          ? { ownerName: hydrateName(e.updatedById) }
          : null,
      }));
    const items = [...(raw.items ?? [])].sort(
      (a, b) => a.lineNumber - b.lineNumber,
    );
    const spHit = raw.salespersonId
      ? dir.get(raw.salespersonId)
      : undefined;
    return {
      ...raw,
      items,
      salesperson: raw.salespersonId
        ? {
            ownerName: spHit?.ownerName ?? null,
            phone: spHit?.phone ?? null,
          }
        : null,
      events,
    } as OrderDetail;
  });
}

// Set the production stage on one line. The DB trigger
// _recompute_order_status_from_lines rolls the header's currentStatus
// from the aggregate. RLS `sales_order_item_update_factory` gates
// this to FACTORY + ADMIN.
export async function setLineProductionStatus(
  itemId: string,
  status: LineProductionStatus,
): Promise<{ ok: true } | { error: string }> {
  // SalesOrderItem was added by migration 20260824180000 and isn't in
  // the regenerated types yet. Cast through unknown so the eq/update
  // pair typechecks; the shape is correct at runtime.
  const { error } = await (supabase.from as unknown as (
    rel: string,
  ) => {
    update: (v: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  })("SalesOrderItem")
    .update({ productionStatus: status })
    .eq("id", itemId);
  if (error) return { error: error.message };
  return { ok: true };
}

// Set expectedProductionDate on the order. Factory RLS allows this
// column to be updated by FACTORY role.
export async function setExpectedProductionDate(
  orderId: string,
  isoDate: string | null,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase
    .from("SalesOrder")
    .update({ expectedProductionDate: isoDate })
    .eq("id", orderId);
  if (error) return { error: error.message };
  return { ok: true };
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
    // Prefix match — typing "Shri" surfaces every ledger starting
    // with "Shri". Substring would drown the user in incidental hits
    // ("… (Shri something)"). RLS on Party filters to the caller's
    // assigned rows only, so the dropdown never leaks another
    // salesperson's book.
    if (trimmed) q = q.ilike("name", `${trimmed}%`);
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
  /** Factory-side grade code (WR-48, PA-60s, PSA 55, …). Salespeople
   *  can search by either name or code; the picker shows both. */
  code: string | null;
  sortOrder: number;
  /** Comes back as number | string | null from PostgREST for a decimal
   *  column; consumers coerce with Number(). Included so the review
   *  screen can show a below-floor warning BEFORE submit. */
  floorRate: number | string | null;
};

export function useProducts() {
  return useQuery<ProductRow[]>("products", async () => {
    const { data, error } = await supabase
      .from("Product")
      .select("id, name, brand, code, sortOrder, floorRate")
      .eq("isActive", true)
      .order("brand", { ascending: true })
      .order("sortOrder", { ascending: true });
    if (error) throw error;
    // Cast via unknown — the generated Database types don't know
    // about Product.code yet (migration 20260826180000_product_grade_codes
    // added the column; run npm run types:generate to refresh).
    return (data ?? []) as unknown as ProductRow[];
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
