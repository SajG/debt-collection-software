import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { confirm } from "@/components/Confirm";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatINR } from "@/lib/format";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";

// Admin command centre. Tiles reflect what a director wants to see
// on their phone in the morning: today's + weekly volume, anything
// waiting on their approval (red if > 0), rate exceptions, overdue
// orders, held orders with reason breakdown, dispatched value MoM.
// Every tile taps through to a filtered list (existing screens where
// possible).

type Tiles = {
  // SY24 — money-focused KPIs at the top.
  totalOutstanding: number;
  overdueInvoicesCount: number;
  collectedThisMonth: number;
  dso: number | null; // days
  placedToday: { count: number; value: number };
  placedWeek: { count: number; value: number };
  pendingApproval: number;
  rateApproval: number;
  overdue: number;
  onHold: {
    total: number;
    byReason: { category: string | null; count: number }[];
  };
  dispatchedThisMonth: number;
  dispatchedLastMonth: number;
  loadingAt: string | null;
};

const EMPTY: Tiles = {
  totalOutstanding: 0,
  overdueInvoicesCount: 0,
  collectedThisMonth: 0,
  dso: null,
  placedToday: { count: 0, value: 0 },
  placedWeek: { count: 0, value: 0 },
  pendingApproval: 0,
  rateApproval: 0,
  overdue: 0,
  onHold: { total: 0, byReason: [] },
  dispatchedThisMonth: 0,
  dispatchedLastMonth: 0,
  loadingAt: null,
};

// SY33 — every number comes from get_management_summary(), computed in
// SQL for the caller's active company. The old version downloaded
// Party / Payment / SalesOrder rows and summed them here, which went
// wrong past Supabase's 1,000-row response cap.
type ManagementSummary = {
  totalOutstanding: number | string;
  overdueInvoicesCount: number | string;
  overdueAmount: number | string;
  collectedThisMonth: number | string;
  dsoDays: number | string | null;
  placedTodayCount: number | string;
  placedTodayValue: number | string;
  placedWeekCount: number | string;
  placedWeekValue: number | string;
  pendingApproval: number | string;
  rateApproval: number | string;
  overdueOrders: number | string;
  onHoldTotal: number | string;
  onHoldByReason: { category: string | null; count: number | string }[];
  dispatchedThisMonth: number | string;
  dispatchedLastMonth: number | string;
};

const num = (v: number | string | null | undefined): number => Number(v ?? 0);
const money = (v: number | string | null | undefined): number =>
  Math.round(num(v) * 100) / 100;

async function loadTiles(): Promise<Tiles> {
  // Cast: get_management_summary is added by migration
  // 20261003000000_sy33_rpc_tenant_guards and isn't in the generated types.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ data: ManagementSummary | null; error: { message: string } | null }>)(
    "get_management_summary",
  );
  if (error) throw new Error(error.message);
  if (!data) return { ...EMPTY, loadingAt: new Date().toISOString() };

  return {
    totalOutstanding: money(data.totalOutstanding),
    overdueInvoicesCount: num(data.overdueInvoicesCount),
    collectedThisMonth: money(data.collectedThisMonth),
    dso: data.dsoDays === null ? null : num(data.dsoDays),
    placedToday: { count: num(data.placedTodayCount), value: money(data.placedTodayValue) },
    placedWeek: { count: num(data.placedWeekCount), value: money(data.placedWeekValue) },
    pendingApproval: num(data.pendingApproval),
    rateApproval: num(data.rateApproval),
    overdue: num(data.overdueOrders),
    onHold: {
      total: num(data.onHoldTotal),
      byReason: (data.onHoldByReason ?? []).map((r) => ({
        category: r.category,
        count: num(r.count),
      })),
    },
    dispatchedThisMonth: money(data.dispatchedThisMonth),
    dispatchedLastMonth: money(data.dispatchedLastMonth),
    loadingAt: new Date().toISOString(),
  };
}

export default function AdminCommandCentre() {
  const { profile, signOut } = useAuth();
  const [tiles, setTiles] = useState<Tiles>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const load = useCallback(async () => {
    const v = ++versionRef.current;
    setError(null);
    try {
      const next = await loadTiles();
      if (versionRef.current === v) setTiles(next);
    } catch (e) {
      if (versionRef.current === v) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  useEffect(() => {
    void load();
    // Realtime: any SalesOrder insert/update refreshes the tile grid.
    // Fires cheaply — one get_management_summary() call.
    const channel = supabase.channel(
      `admin-tiles:${Math.random().toString(36).slice(2, 10)}`,
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

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const mom = useMemo(() => {
    if (tiles.dispatchedLastMonth === 0) return null;
    const delta =
      ((tiles.dispatchedThisMonth - tiles.dispatchedLastMonth) /
        tiles.dispatchedLastMonth) *
      100;
    return delta;
  }, [tiles]);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>
            {t("admin.title", { name: profile?.ownerName ?? "" })}
          </Text>
          <Text style={styles.subtitle}>{t("admin.subtitle")}</Text>
        </View>
        <Pressable
          onPress={() => router.push("/(staff)")}
          hitSlop={8}
          style={({ pressed }) => [styles.staffBtn, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="Switch to salesperson view"
        >
          <Text style={styles.staffBtnText}>{t("admin.switchToStaff")}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/account")}
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("account.title")}
        >
          <Text style={styles.signOutGlyph}>⚙</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            confirm({
              title: t("confirm.signOut.title"),
              body: t("confirm.signOut.body"),
              confirmLabel: t("confirm.ok"),
              destructive: true,
              onConfirm: () => void signOut(),
            })
          }
          hitSlop={8}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("home.signOut")}
        >
          <Text style={styles.signOutGlyph}>⏻</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* SY24 — money-first top row. */}
        <Row>
          <Tile
            label="Total outstanding"
            value={formatINR(tiles.totalOutstanding)}
            sub="Across all customers"
            onPress={() => router.push("/(staff)/dues")}
          />
          <Tile
            label="Overdue invoices"
            value={String(tiles.overdueInvoicesCount)}
            danger={tiles.overdueInvoicesCount > 0}
            onPress={() => router.push("/(staff)/dues")}
          />
        </Row>
        <Row>
          <Tile
            label="Collected this month"
            value={formatINR(tiles.collectedThisMonth)}
            onPress={() => router.push("/(admin)/team")}
          />
          <Tile
            label="DSO"
            value={tiles.dso === null ? "—" : `${tiles.dso} d`}
            sub="Days sales outstanding (approx)"
            onPress={() => router.push("/(admin)/team")}
          />
        </Row>

        <Row>
          <Tile
            label="Placed today"
            value={String(tiles.placedToday.count)}
            sub={formatINR(tiles.placedToday.value)}
            onPress={() => router.push("/(staff)")}
          />
          <Tile
            label="Placed this week"
            value={String(tiles.placedWeek.count)}
            sub={formatINR(tiles.placedWeek.value)}
            onPress={() => router.push("/(staff)")}
          />
        </Row>

        <Row>
          <Tile
            label="Awaiting MY approval"
            value={String(tiles.pendingApproval)}
            danger={tiles.pendingApproval > 0}
            onPress={() => router.push("/(admin)/approvals")}
          />
          <Tile
            label="Rate approvals pending"
            value={String(tiles.rateApproval)}
            danger={tiles.rateApproval > 0}
            onPress={() => router.push("/(admin)/approvals")}
          />
        </Row>

        <Row>
          <Tile
            label="Overdue deliveries"
            value={String(tiles.overdue)}
            sub="Past expected delivery date"
            danger={tiles.overdue > 0}
            onPress={() => router.push("/(admin)/factory")}
          />
          <Tile
            label="On hold"
            value={String(tiles.onHold.total)}
            sub={
              tiles.onHold.byReason
                .map(
                  (r) =>
                    `${r.category?.replace(/_/g, " ") ?? "Other"} · ${r.count}`,
                )
                .join("\n") || "—"
            }
            onPress={() => router.push("/(admin)/factory")}
          />
        </Row>

        <Row>
          <Tile
            label="Dispatched this month"
            value={formatINR(tiles.dispatchedThisMonth)}
            sub={
              mom === null
                ? `Last month: ${formatINR(tiles.dispatchedLastMonth)}`
                : `${mom >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(mom))}% vs last month (${formatINR(tiles.dispatchedLastMonth)})`
            }
            danger={mom !== null && mom < -10}
            wide
            onPress={() => router.push("/(admin)/team")}
          />
        </Row>
        <Text style={styles.footer}>
          Live · updates whenever a sales order changes.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Tile({
  label,
  value,
  sub,
  danger,
  wide,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
  wide?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        wide && styles.tileWide,
        danger && styles.tileDanger,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
    >
      <Text style={[styles.tileLabel, danger && { color: theme.colors.danger }]}>
        {label}
      </Text>
      <Text style={[styles.tileValue, danger && { color: theme.colors.danger }]}>
        {value}
      </Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  hello: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  staffBtn: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  staffBtnText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  signOutGlyph: {
    fontSize: 16,
    color: theme.colors.danger,
    fontWeight: "700",
  },
  grid: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  row: { flexDirection: "row", gap: theme.spacing.md },
  tile: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    minHeight: 110,
    gap: 4,
  },
  tileWide: { flex: 1 },
  tileDanger: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  tileValue: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
    marginTop: 4,
  },
  tileSub: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  errorBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.type.bodySmall,
  },
  footer: {
    marginTop: theme.spacing.md,
    textAlign: "center",
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
});
