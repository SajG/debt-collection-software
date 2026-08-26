import { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { confirm } from "@/components/Confirm";
import { supabase } from "@/lib/supabase";
import { getProfileDirectory } from "@/lib/profile-directory";
import { formatINR } from "@/lib/format";
import { theme } from "@/theme";

// Per-salesperson performance table. Aggregates are computed
// client-side over a bounded orders window (last 90 days) to avoid
// pulling the whole history — a director's phone glance, not a report.

type Row = {
  profileId: string;
  ownerName: string;
  role: string;
  isActive: boolean;
  ordersPlaced: number;
  valuePlaced: number;
  avgOrderToDispatchHours: number | null;
  overdueCount: number;
};

const WINDOW_DAYS = 90;

async function loadTeam(): Promise<Row[]> {
  const from = new Date();
  from.setDate(from.getDate() - WINDOW_DAYS);
  const fromIso = from.toISOString();

  const [dir, ordersR, dispatchesR, profilesR] = await Promise.all([
    getProfileDirectory(),
    supabase
      .from("SalesOrder")
      .select("id, salespersonId, orderValue, currentStatus, expectedDeliveryDate, createdAt")
      .gte("createdAt", fromIso)
      .limit(2000),
    // Order-to-dispatch time: use the DISPATCHED OrderStatusEvent as
    // the ground truth (createdAt on SalesOrder is the placement time).
    supabase
      .from("OrderStatusEvent")
      .select("salesOrderId, createdAt")
      .eq("status", "DISPATCHED")
      .gte("createdAt", fromIso)
      .limit(2000),
    // Every profile — we want inactive users visible so the admin can
    // reactivate them from this screen.
    supabase
      .from("Profile")
      .select("id, ownerName, role, isActive")
      .in("role", ["STAFF", "ADMIN"])
      .order("ownerName", { ascending: true }),
  ]);

  if (ordersR.error) throw ordersR.error;
  if (dispatchesR.error) throw dispatchesR.error;
  if (profilesR.error) throw profilesR.error;

  type OrderRow = {
    id: string;
    salespersonId: string;
    orderValue: number | string | null;
    currentStatus: string;
    expectedDeliveryDate: string | null;
    createdAt: string;
  };
  type EvRow = { salesOrderId: string; createdAt: string };
  type ProfRow = { id: string; ownerName: string; role: string; isActive: boolean };

  const orders = (ordersR.data ?? []) as unknown as OrderRow[];
  const dispatches = (dispatchesR.data ?? []) as unknown as EvRow[];
  const profiles = (profilesR.data ?? []) as unknown as ProfRow[];

  const orderById = new Map<string, OrderRow>();
  for (const o of orders) orderById.set(o.id, o);

  const dispatchByOrder = new Map<string, string>();
  for (const e of dispatches) {
    // First DISPATCHED event per order — earliest wins.
    const cur = dispatchByOrder.get(e.salesOrderId);
    if (!cur || e.createdAt < cur) dispatchByOrder.set(e.salesOrderId, e.createdAt);
  }

  const now = new Date();
  const bySalesperson = new Map<
    string,
    {
      ordersPlaced: number;
      valuePlaced: number;
      dispatchMs: number[];
      overdue: number;
    }
  >();
  const bucket = (id: string) => {
    let b = bySalesperson.get(id);
    if (!b) {
      b = { ordersPlaced: 0, valuePlaced: 0, dispatchMs: [], overdue: 0 };
      bySalesperson.set(id, b);
    }
    return b;
  };
  for (const o of orders) {
    const b = bucket(o.salespersonId);
    b.ordersPlaced++;
    b.valuePlaced += Number(o.orderValue ?? 0);
    const disp = dispatchByOrder.get(o.id);
    if (disp) {
      const dt = Date.parse(disp) - Date.parse(o.createdAt);
      if (Number.isFinite(dt) && dt >= 0) b.dispatchMs.push(dt);
    }
    if (
      o.expectedDeliveryDate &&
      new Date(o.expectedDeliveryDate) < now &&
      !["DISPATCHED", "DELIVERED", "CANCELLED", "REJECTED"].includes(
        o.currentStatus,
      )
    ) {
      b.overdue++;
    }
  }

  return profiles.map((p) => {
    const b = bySalesperson.get(p.id);
    const hitDir = dir.get(p.id);
    const avgMs =
      b && b.dispatchMs.length > 0
        ? b.dispatchMs.reduce((s, x) => s + x, 0) / b.dispatchMs.length
        : null;
    return {
      profileId: p.id,
      ownerName: p.ownerName || hitDir?.ownerName || "—",
      role: p.role,
      isActive: p.isActive,
      ordersPlaced: b?.ordersPlaced ?? 0,
      valuePlaced: Math.round((b?.valuePlaced ?? 0) * 100) / 100,
      avgOrderToDispatchHours: avgMs === null ? null : avgMs / 3600000,
      overdueCount: b?.overdue ?? 0,
    };
  });
}

async function setUserActiveRpc(
  profileId: string,
  active: boolean,
  note: string | null,
) {
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>)("set_user_active", {
    p_target: profileId,
    p_active: active,
    p_note: note ?? null,
  });
  return error ? { error: error.message } : { ok: true as const };
}

export default function AdminTeam() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await loadTeam();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  function askToggle(row: Row) {
    const next = !row.isActive;
    confirm({
      title: next ? `Reactivate ${row.ownerName}?` : `Deactivate ${row.ownerName}?`,
      body: next
        ? "They will be able to sign in and place orders again."
        : "They will be signed out and blocked from signing in. All their historical data stays.",
      confirmLabel: next ? "Reactivate" : "Deactivate",
      destructive: !next,
      onConfirm: async () => {
        const res = await setUserActiveRpc(row.profileId, next, null);
        if ("error" in res) Alert.alert("Could not update", res.error);
        else await load();
      },
    });
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Team</Text>
        <Text style={styles.subtitle}>
          Last {WINDOW_DAYS} days · tap a row to see orders · long-press
          the pill to enable/disable.
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.profileId}
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
            <Text style={styles.empty}>{error ?? "No team members."}</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              // No per-salesperson filter today; the staff home
              // "all orders" view with a name search is the closest
              // approximation. Deep-link once we add filters.
              router.push("/(staff)")
            }
            style={({ pressed }) => [
              styles.row,
              !item.isActive && styles.rowInactive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={styles.rowTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.ownerName}</Text>
                <Text style={styles.role}>{item.role}</Text>
              </View>
              <Pressable
                onPress={() => askToggle(item)}
                onLongPress={() => askToggle(item)}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.statusPill,
                  item.isActive ? styles.pillActive : styles.pillInactive,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  item.isActive ? "Deactivate user" : "Reactivate user"
                }
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: item.isActive ? theme.colors.primary : theme.colors.danger },
                  ]}
                >
                  {item.isActive ? "ACTIVE" : "INACTIVE"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.stats}>
              <Stat label="Orders" value={String(item.ordersPlaced)} />
              <Stat label="Value" value={formatINR(item.valuePlaced)} />
              <Stat
                label="Avg O→D"
                value={
                  item.avgOrderToDispatchHours == null
                    ? "—"
                    : item.avgOrderToDispatchHours < 24
                      ? `${item.avgOrderToDispatchHours.toFixed(0)}h`
                      : `${(item.avgOrderToDispatchHours / 24).toFixed(1)}d`
                }
              />
              <Stat
                label="Overdue"
                value={String(item.overdueCount)}
                danger={item.overdueCount > 0}
              />
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={statStyles.wrap}>
      <Text style={statStyles.label}>{label}</Text>
      <Text
        style={[
          statStyles.value,
          danger && { color: theme.colors.danger },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  wrap: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  value: {
    fontSize: theme.type.body,
    fontWeight: "800",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
});

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
  list: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  row: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 12,
  },
  rowInactive: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.surface,
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name: {
    fontSize: theme.type.body,
    fontWeight: "800",
    color: theme.colors.text,
  },
  role: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.background,
  },
  pillInactive: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
  },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  stats: { flexDirection: "row", gap: 12 },
  empty: {
    marginTop: theme.spacing.xl,
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
});
