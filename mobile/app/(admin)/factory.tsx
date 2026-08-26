import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { theme } from "@/theme";

// Director's read-only view of the factory floor. Answers:
//   - What's in each stage right now?
//   - What's stuck? (oldest 5 orders whose currentStatus hasn't moved
//     in > 24 h)
//   - How long, on average, does an order spend in each stage?
//
// Metrics are computed over the last 60 days of OrderStatusEvent
// rows. Pull-to-refresh; no realtime — this is a briefing, not an ops
// dashboard.

type StageCounts = Record<string, number>;
type StageAvgHours = Record<string, number | null>;
type Stuck = {
  id: string;
  orderNumber: string;
  partyName: string;
  currentStatus: string;
  lastEventAt: string;
  hoursSince: number;
};

const STAGES = [
  "ORDER_PLACED",
  "IN_PRODUCTION",
  "READY_TO_DISPATCH",
  "LR_GENERATED",
  "PARTIALLY_DISPATCHED",
] as const;

async function loadFactory(): Promise<{
  counts: StageCounts;
  avgHours: StageAvgHours;
  stuck: Stuck[];
}> {
  const window = new Date();
  window.setDate(window.getDate() - 60);
  const windowIso = window.toISOString();

  const [counts, events, stuckR] = await Promise.all([
    (async () => {
      const c: StageCounts = {};
      await Promise.all(
        STAGES.map(async (s) => {
          const { count } = await supabase
            .from("SalesOrder")
            .select("id", { count: "exact", head: true })
            .eq("currentStatus", s);
          c[s] = count ?? 0;
        }),
      );
      return c;
    })(),
    supabase
      .from("OrderStatusEvent")
      .select("salesOrderId, status, createdAt")
      .gte("createdAt", windowIso)
      .order("createdAt", { ascending: true })
      .limit(5000),
    // Stuck: last OrderStatusEvent older than 24 h, currentStatus is
    // still in-flight. One query per order would be N+1; instead ask
    // for the top 40 in-flight orders sorted by updatedAt asc — the
    // header updatedAt is bumped by the trigger on line change or by
    // status advance, so it's a good proxy.
    supabase
      .from("SalesOrder")
      .select(
        `id, orderNumber, currentStatus, updatedAt,
         party:Party!SalesOrder_partyId_fkey(name)`,
      )
      .in("currentStatus", [...STAGES])
      .order("updatedAt", { ascending: true })
      .limit(40),
  ]);

  const now = Date.now();
  type Ev = { salesOrderId: string; status: string; createdAt: string };
  const evs = (events.data ?? []) as unknown as Ev[];

  // Group events by order in chronological order; per pair of
  // consecutive events for the same order, the elapsed time is the
  // time that order spent in the earlier state. Bucket by that state.
  const byOrder = new Map<string, Ev[]>();
  for (const e of evs) {
    const arr = byOrder.get(e.salesOrderId) ?? [];
    arr.push(e);
    byOrder.set(e.salesOrderId, arr);
  }
  const stageDurations = new Map<string, number[]>();
  for (const arr of byOrder.values()) {
    for (let i = 0; i < arr.length - 1; i++) {
      const from = arr[i];
      const to = arr[i + 1];
      const dt = Date.parse(to.createdAt) - Date.parse(from.createdAt);
      if (!Number.isFinite(dt) || dt < 0) continue;
      const list = stageDurations.get(from.status) ?? [];
      list.push(dt);
      stageDurations.set(from.status, list);
    }
  }
  const avgHours: StageAvgHours = {};
  for (const s of STAGES) {
    const list = stageDurations.get(s);
    avgHours[s] =
      list && list.length > 0
        ? list.reduce((a, b) => a + b, 0) / list.length / 3600000
        : null;
  }

  type StuckRow = {
    id: string;
    orderNumber: string;
    currentStatus: string;
    updatedAt: string;
    party: { name: string } | null;
  };
  const stuckRaw = (stuckR.data ?? []) as unknown as StuckRow[];
  const stuck: Stuck[] = stuckRaw
    .map((r) => {
      const hours = (now - Date.parse(r.updatedAt)) / 3600000;
      return {
        id: r.id,
        orderNumber: r.orderNumber,
        partyName: r.party?.name ?? "—",
        currentStatus: r.currentStatus,
        lastEventAt: r.updatedAt,
        hoursSince: hours,
      };
    })
    .filter((s) => s.hoursSince > 24)
    .slice(0, 8);

  return { counts, avgHours, stuck };
}

export default function AdminFactory() {
  const [state, setState] = useState<{
    counts: StageCounts;
    avgHours: StageAvgHours;
    stuck: Stuck[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await loadFactory());
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

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Factory</Text>
        <Text style={styles.subtitle}>
          Read-only view of the shop floor. Averages are over the last 60
          days.
        </Text>
      </View>

      <FlatList
        data={state?.stuck ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {loading && !state ? (
              <View style={{ padding: theme.spacing.xl }}>
                <ActivityIndicator />
              </View>
            ) : null}

            <Text style={styles.sectionHeading}>Stage</Text>
            <View style={styles.stageGrid}>
              {STAGES.map((s) => (
                <View key={s} style={styles.stageCell}>
                  <Text style={styles.stageLabel}>
                    {s.replace(/_/g, " ")}
                  </Text>
                  <Text style={styles.stageCount}>
                    {state?.counts[s] ?? 0}
                  </Text>
                  <Text style={styles.stageAvg}>
                    Avg{" "}
                    {state?.avgHours[s] == null
                      ? "—"
                      : state.avgHours[s]! < 24
                        ? `${Math.round(state.avgHours[s]!)}h`
                        : `${(state.avgHours[s]! / 24).toFixed(1)}d`}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeading}>Stuck &gt; 24 h</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              Nothing stuck. Every in-flight order moved within 24 h.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(staff)/orders/[id]",
                params: { id: item.id },
              })
            }
            style={({ pressed }) => [styles.stuckRow, pressed && { opacity: 0.85 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.stuckOrder}>{item.orderNumber}</Text>
              <Text style={styles.stuckParty}>{item.partyName}</Text>
              <Text style={styles.stuckMeta}>
                {item.currentStatus.replace(/_/g, " ")} · last change{" "}
                {formatDate(new Date(item.lastEventAt))}
              </Text>
            </View>
            <View style={styles.stuckPill}>
              <Text style={styles.stuckPillText}>
                {item.hoursSince < 48
                  ? `${Math.round(item.hoursSince)}h`
                  : `${Math.round(item.hoursSince / 24)}d`}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

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
  errorBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.type.bodySmall,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  stageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stageCell: {
    flexBasis: "48%",
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 2,
  },
  stageLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
  },
  stageCount: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  stageAvg: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  stuckRow: {
    flexDirection: "row",
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
    alignItems: "center",
    gap: 12,
  },
  stuckOrder: {
    fontFamily: "monospace",
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: "700",
  },
  stuckParty: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 2,
  },
  stuckMeta: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  stuckPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.danger,
  },
  stuckPillText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  empty: {
    marginTop: theme.spacing.md,
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
});
