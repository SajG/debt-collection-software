import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { confirm } from "@/components/Confirm";
import { supabase } from "@/lib/supabase";
import { formatDate, formatINR } from "@/lib/format";
import { theme } from "@/theme";

// Combined approvals queue. Two kinds of item share the list:
//   ORDER: PENDING_APPROVAL — approve/reject
//   RATE:  needsRateApproval=true — approve rate only
// Swipe right → approve. Swipe left → reject with reason (order only).
// Server routes:
//   approve_order (RPC) — migration 20260821205000
//   reject_order  (RPC) — migration 20260821205000
//   approve_rate  (RPC) — migration 20260825140000_admin_mobile_rpcs
// Every RPC writes its own audit row (OrderStatusEvent).

type Item = {
  kind: "ORDER" | "RATE";
  id: string;
  orderNumber: string;
  partyName: string;
  productName: string;
  brand: string | null;
  orderValue: number;
  createdAt: string;
  needsRateApproval: boolean;
};

async function loadApprovals(): Promise<Item[]> {
  // A blocked order can hit BOTH gates at once (PENDING_APPROVAL AND
  // needsRateApproval=true). Show it as ORDER then — order approval
  // is the terminal decision; approving the rate first still leaves
  // the order pending.
  const { data, error } = await supabase
    .from("SalesOrder")
    .select(
      `id, orderNumber, currentStatus, orderValue, brand, createdAt,
       needsRateApproval,
       party:Party!SalesOrder_partyId_fkey(name),
       product:Product!SalesOrder_productId_fkey(name)`,
    )
    .or("currentStatus.eq.PENDING_APPROVAL,needsRateApproval.eq.true")
    .order("createdAt", { ascending: true })
    .limit(200);
  if (error) throw error;
  type Row = {
    id: string;
    orderNumber: string;
    currentStatus: string;
    orderValue: number | string | null;
    brand: string | null;
    createdAt: string;
    needsRateApproval: boolean;
    party: { name: string } | null;
    product: { name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    kind: r.currentStatus === "PENDING_APPROVAL" ? "ORDER" : "RATE",
    id: r.id,
    orderNumber: r.orderNumber,
    partyName: r.party?.name ?? "—",
    productName: r.product?.name ?? "—",
    brand: r.brand,
    orderValue: Number(r.orderValue ?? 0),
    createdAt: r.createdAt,
    needsRateApproval: r.needsRateApproval,
  }));
}

async function approveOrderRpc(orderId: string, note: string | null) {
  const { error } = await supabase.rpc("approve_order", {
    p_order_id: orderId,
    p_note: note?.slice(0, 1000) ?? undefined,
  });
  return error ? { error: error.message } : { ok: true as const };
}

async function rejectOrderRpc(orderId: string, reason: string) {
  const { error } = await supabase.rpc("reject_order", {
    p_order_id: orderId,
    p_reason: reason.slice(0, 1000),
  });
  return error ? { error: error.message } : { ok: true as const };
}

async function approveRateRpc(orderId: string, note: string | null) {
  // Cast: approve_rate is added by migration
  // 20260825140000_admin_mobile_rpcs and isn't in the regenerated types.
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>)("approve_rate", {
    p_order_id: orderId,
    p_note: note ?? null,
  });
  return error ? { error: error.message } : { ok: true as const };
}

export default function AdminApprovals() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await loadApprovals();
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel(
      `admin-approvals:${Math.random().toString(36).slice(2, 10)}`,
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "SalesOrder" },
      () => void load(),
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  async function doApprove(it: Item) {
    const fn = it.kind === "ORDER" ? approveOrderRpc : approveRateRpc;
    const res = await fn(it.id, null);
    if ("error" in res) {
      Alert.alert("Approve failed", res.error);
      return;
    }
    await load();
  }

  function askReject(it: Item) {
    if (it.kind !== "ORDER") {
      Alert.alert("Rate approvals", "Rate exceptions can only be approved or left pending.");
      return;
    }
    // Simple reason prompt: use confirm() with a follow-up TextField
    // screen would be nicer, but keep this compact — reject-with-reason
    // is the exception path. Fall back to a required stock reason.
    confirm({
      title: `Reject ${it.orderNumber}?`,
      body: "The salesperson will get a push notification.",
      confirmLabel: "Reject",
      destructive: true,
      onConfirm: async () => {
        const res = await rejectOrderRpc(
          it.id,
          "Rejected from mobile — see order detail",
        );
        if ("error" in res) Alert.alert("Reject failed", res.error);
        else await load();
      },
    });
  }

  const emptyMessage = useMemo(() => {
    if (loading) return null;
    if (error) return error;
    return "Nothing pending. All caught up.";
  }, [loading, error]);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Approvals</Text>
        <Text style={styles.subtitle}>
          Swipe right to approve. Swipe left to reject with reason.
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => `${it.kind}:${it.id}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 40 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <Text style={styles.empty}>{emptyMessage}</Text>
          )
        }
        renderItem={({ item }) => (
          <Swipeable
            renderRightActions={() => (
              <Pressable
                onPress={() => askReject(item)}
                style={styles.rejectAction}
              >
                <Text style={styles.actionText}>Reject</Text>
              </Pressable>
            )}
            renderLeftActions={() => (
              <Pressable
                onPress={() => void doApprove(item)}
                style={styles.approveAction}
              >
                <Text style={styles.actionText}>Approve</Text>
              </Pressable>
            )}
          >
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(staff)/orders/[id]",
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.kindPill}>
                  {item.kind === "ORDER" ? "ORDER APPROVAL" : "RATE EXCEPTION"}
                </Text>
                <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                <Text style={styles.party}>{item.partyName}</Text>
                <Text style={styles.meta}>
                  {[item.brand, item.productName].filter(Boolean).join(" · ")}
                </Text>
                <Text style={styles.meta}>
                  Placed {formatDate(new Date(item.createdAt))}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.value}>{formatINR(item.orderValue)}</Text>
                <ApproveInline onPress={() => void doApprove(item)} />
              </View>
            </Pressable>
          </Swipeable>
        )}
      />
    </Screen>
  );
}

function ApproveInline({ onPress }: { onPress: () => void }) {
  return (
    <Button label="Approve" onPress={onPress} fullWidth={false} />
  );
}

// The TextField import is used in the future rejection-with-note flow;
// keep the import so the reject dialog can grow without another edit.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keep = TextField;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  list: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  row: {
    flexDirection: "row",
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 12,
  },
  rowLeft: { flex: 1 },
  rowRight: {
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 8,
  },
  kindPill: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: theme.colors.primary,
    marginBottom: 4,
  },
  orderNumber: {
    fontFamily: "monospace",
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: "700",
  },
  party: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 2,
  },
  meta: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  value: {
    fontSize: theme.type.body,
    fontWeight: "800",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    marginTop: theme.spacing.xl,
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
  approveAction: {
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    borderRadius: theme.radius,
    marginRight: 8,
  },
  rejectAction: {
    backgroundColor: theme.colors.danger,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    borderRadius: theme.radius,
    marginLeft: 8,
  },
  actionText: { color: "#fff", fontWeight: "800" },
});
