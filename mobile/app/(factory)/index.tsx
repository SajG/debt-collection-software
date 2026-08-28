import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { OrderCard } from "@/components/OrderCard";
import { TextField } from "@/components/TextField";
import { EmptyState } from "@/components/EmptyState";
import { OrderCardSkeletonList } from "@/components/Skeleton";
import { SyncPill } from "@/components/SyncPill";
import { confirm } from "@/components/Confirm";
import { useAuth } from "@/auth/AuthContext";
import {
  useOrderEventStream,
  useOwnOrders,
  type OrderListRow,
} from "@/lib/queries";
import type { QuantityUnit } from "@/lib/database.types";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Factory home. Five tabs (adds "Blocked" over the old four) + a
// search bar. Within a tab, orders are listed oldest-first so the
// shop floor always sees the stalest work first — no grouping toggle
// to think about.

type Filter = "queue" | "in_production" | "ready" | "dispatched" | "blocked";

export default function FactoryHome() {
  const { profile, user, signOut } = useAuth();
  const [filter, setFilter] = useState<Filter>("queue");
  const [search, setSearch] = useState("");

  const { data, loading, error, refetch } = useOwnOrders(
    "all",
    "all",
    user?.id ?? null,
  );
  useOrderEventStream(refetch, user?.id ?? null);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Filter → search → return ready-to-render rows. Kept in this order
  // so search always operates on the tab the user is looking at (a
  // search in "Queue" doesn't surface a DISPATCHED hit).
  const filtered = useMemo(() => {
    const src = data ?? [];
    const inTab = src.filter((o) => matchesTab(o, filter));
    const needle = search.trim().toLowerCase();
    if (!needle) return inTab;
    return inTab.filter((o) => {
      const partyName = (o.party?.name ?? o.newCustomerName ?? "").toLowerCase();
      const orderNo = o.orderNumber.toLowerCase();
      const salesName = (o.salesperson?.ownerName ?? "").toLowerCase();
      return (
        partyName.includes(needle) ||
        orderNo.includes(needle) ||
        salesName.includes(needle)
      );
    });
  }, [data, filter, search]);

  const sections = useMemo(
    () => [{ title: null as string | null, data: sortByCreatedAsc(filtered) }],
    [filtered],
  );

  const emptyMessage = getEmptyMessage(filter, !!search.trim());

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.hello} numberOfLines={1}>
            {t("factory.title", { name: profile?.ownerName ?? "" })}
          </Text>
          <Text style={styles.subtitle}>{t("factory.subtitle")}</Text>
        </View>
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

      <View style={styles.controls}>
        <SyncPill />
        <TextField
          label={t("factory.search")}
          placeholder={t("factory.search.placeholder")}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { label: t("factory.tab.queue"), value: "queue" },
            { label: t("factory.tab.inProd"), value: "in_production" },
            { label: t("factory.tab.ready"), value: "ready" },
            { label: t("factory.tab.dispatched"), value: "dispatched" },
            { label: t("factory.tab.blocked"), value: "blocked" },
          ]}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionHeader}>{section.title}</Text>
              <Text style={styles.sectionCount}>
                {section.data.length}{" "}
                {section.data.length === 1 ? "order" : "orders"}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={{ marginBottom: 12 }}>
            <OrderCard
              partyName={item.party?.name ?? item.newCustomerName ?? "—"}
              productName={
                item.itemCount > 1
                  ? `${item.product?.name ?? "—"} · +${item.itemCount - 1} more`
                  : (item.product?.name ?? "—")
              }
              brand={item.brand ?? item.product?.brand ?? null}
              quantity={
                item.itemCount > 1 ? `${item.itemCount} lines` : String(item.quantity)
              }
              quantityUnit={item.quantityUnit as QuantityUnit}
              status={item.currentStatus}
              orderNumber={item.orderNumber}
              salespersonName={
                item.salesperson
                  ? (item.salesperson.ownerName ?? "Unknown user")
                  : "Unknown user"
              }
              salespersonPhone={item.salesperson?.phone ?? null}
              onPress={() =>
                router.push({
                  pathname:
                    filter === "blocked"
                      ? "/(factory)/orders/[id]"
                      : "/(factory)/orders/[id]",
                  params: { id: item.id },
                })
              }
            />
            {filter === "blocked" ? (
              <BlockedReason row={item} />
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <OrderCardSkeletonList count={4} />
          ) : (
            <EmptyState
              glyph={emptyGlyph(filter)}
              title={error ? t("home.error") : emptyMessage}
              footnote={
                filter === "queue" && !error
                  ? lastArrivalFootnote(data ?? [])
                  : undefined
              }
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing || loading}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      />
    </Screen>
  );
}

function matchesTab(o: OrderListRow, filter: Filter): boolean {
  switch (filter) {
    case "queue":
      return o.currentStatus === "ORDER_PLACED" && !o.needsRateApproval;
    case "in_production":
      return o.currentStatus === "IN_PRODUCTION";
    case "ready":
      return (
        o.currentStatus === "READY_TO_DISPATCH" ||
        o.currentStatus === "LR_GENERATED"
      );
    case "dispatched":
      return o.currentStatus === "DISPATCHED";
    case "blocked":
      // Anything the factory can't act on right now: awaiting admin,
      // held for cause, or gated by rate approval. Read-only cards.
      return (
        o.currentStatus === "PENDING_APPROVAL" ||
        o.currentStatus === "ON_HOLD" ||
        o.needsRateApproval
      );
  }
}

function sortByCreatedAsc(rows: OrderListRow[]): OrderListRow[] {
  return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function emptyGlyph(filter: Filter): string {
  switch (filter) {
    case "queue":
      return "◔";
    case "in_production":
      return "⚙";
    case "ready":
      return "◍";
    case "dispatched":
      return "→";
    case "blocked":
      return "⚠";
  }
}

function lastArrivalFootnote(rows: { createdAt: string }[]): string | undefined {
  if (rows.length === 0) return undefined;
  const latest = rows.reduce(
    (a, b) => (a.createdAt > b.createdAt ? a : b),
    rows[0],
  );
  const ms = Date.now() - Date.parse(latest.createdAt);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const min = Math.round(ms / 60000);
  if (min < 60) return `Last order arrived ${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Last order arrived ${hr} h ago`;
  const day = Math.round(hr / 24);
  return `Last order arrived ${day} day${day === 1 ? "" : "s"} ago`;
}

function getEmptyMessage(filter: Filter, hasSearch: boolean): string {
  if (hasSearch) return t("factory.empty.search");
  switch (filter) {
    case "queue":
      return t("factory.empty.queue");
    case "in_production":
      return t("factory.empty.inProd");
    case "ready":
      return t("factory.empty.ready");
    case "dispatched":
      return t("factory.empty.dispatched");
    case "blocked":
      return t("factory.empty.blocked");
  }
}

function BlockedReason({ row }: { row: OrderListRow }) {
  const reason = describeBlock(row);
  const chase = reason.chase;
  return (
    <View style={styles.blockedNote}>
      <Text style={styles.blockedNoteText}>
        <Text style={{ fontWeight: "700" }}>{reason.title}: </Text>
        {reason.body}
      </Text>
      <Text style={styles.blockedChaseText}>{chase}</Text>
    </View>
  );
}

function describeBlock(row: OrderListRow): {
  title: string;
  body: string;
  chase: string;
} {
  if (row.currentStatus === "PENDING_APPROVAL") {
    return {
      title: "Awaiting admin approval",
      body: "An admin must approve before the shop floor sees this.",
      chase: "Chase: admin.",
    };
  }
  if (row.currentStatus === "ON_HOLD") {
    return {
      title: "On hold",
      body:
        [row.holdReasonCategory?.replace(/_/g, " "), row.holdReason]
          .filter(Boolean)
          .join(" — ") || "No reason recorded.",
      chase:
        row.salesperson?.ownerName
          ? `Chase: ${row.salesperson.ownerName}${row.salesperson.phone ? ` (${row.salesperson.phone})` : ""}.`
          : "Chase: salesperson.",
    };
  }
  if (row.needsRateApproval) {
    return {
      title: "Below floor rate",
      body: "One or more lines are below the floor rate and need admin sign-off.",
      chase: "Chase: admin.",
    };
  }
  return { title: "Blocked", body: "Unknown reason.", chase: "" };
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  hello: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
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
  controls: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  filters: {},
  sectionHeaderWrap: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: 8,
    marginHorizontal: -theme.spacing.lg,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sectionCount: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  list: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  empty: {
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xl,
  },
  blockedNote: {
    marginTop: 6,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
    gap: 4,
  },
  blockedNoteText: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
  },
  blockedChaseText: {
    fontSize: theme.type.bodySmall - 1,
    color: theme.colors.textMuted,
    fontWeight: "700",
  },
});
