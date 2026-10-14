import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "./Text";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { OrderCard } from "@/components/OrderCard";
import { TextField } from "@/components/TextField";
import { EmptyState } from "@/components/EmptyState";
import { listEmpty } from "@/components/ListStates";
import { TabHeader } from "@/components/TabHeader";
import { markFirstScreen } from "@/lib/startup";
import { SyncPill } from "@/components/SyncPill";
import { useAuth } from "@/auth/AuthContext";
import {
  useOrderEventStream,
  useOwnOrders,
  type OrderListRow,
} from "@/lib/queries";
import type { QuantityUnit } from "@/lib/database.types";
import { t, tn } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { theme } from "@/theme";
import { holdReasonLabel } from "@/lib/labels";

// One factory tab. The bottom bar has three: To make · To dispatch ·
// Done today. "To make" splits further into waiting / in progress /
// blocked with a segmented control. Orders are listed oldest-first so
// the shop floor always sees the stalest work first.

type Filter = "queue" | "in_production" | "ready" | "dispatched" | "blocked";
export type FactoryTab = "make" | "dispatch" | "done";

const TAB_FILTER: Record<FactoryTab, Filter> = {
  make: "queue",
  dispatch: "ready",
  done: "dispatched",
};

export function FactoryOrders({ tab }: { tab: FactoryTab }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>(TAB_FILTER[tab]);
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
    <Screen padded={false} edges={["top", "left", "right"]}>
      <View onLayout={tab === "make" ? () => markFirstScreen("factory") : undefined}>
        <TabHeader
          title={
            tab === "make"
              ? t("tabs.toMake")
              : tab === "dispatch"
                ? t("tabs.toDispatch")
                : t("tabs.doneToday")
          }
        />
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
        {tab === "make" ? (
          <Segmented<Filter>
            compact
            value={filter}
            onChange={setFilter}
            options={[
              { label: t("factory.tab.queue"), value: "queue" },
              { label: t("factory.tab.inProd"), value: "in_production" },
              { label: t("factory.tab.blocked"), value: "blocked" },
            ]}
          />
        ) : null}
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
                {section.data.length === 1 ? t("factoryHome.order") : t("factoryHome.orders")}
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
                  ? t("orders.productPlusMore", { name: item.product?.name ?? "—", count: item.itemCount - 1 })
                  : (item.product?.name ?? "—")
              }
              brand={item.brand ?? item.product?.brand ?? null}
              quantity={
                item.itemCount > 1 ? tn("orders.lines", item.itemCount) : String(item.quantity)
              }
              quantityUnit={item.quantityUnit as QuantityUnit}
              status={item.currentStatus}
              orderNumber={item.orderNumber}
              salespersonName={
                item.salesperson?.ownerName ?? t("common.unknownUser")
              }
              salespersonPhone={item.salesperson?.phone ?? null}
              onPress={() =>
                router.push({
                  pathname: "/(factory)/orders/[id]",
                  params: { id: item.id },
                })
              }
            />
            {filter === "blocked" ? (
              <BlockedReason row={item} />
            ) : null}
          </View>
        )}
        ListEmptyComponent={listEmpty({
          loading: loading && !data,
          error: data ? null : error ? t("home.error") : null,
          onRetry: () => void refetch(),
          skeletonCount: 4,
          empty: (
            <EmptyState
              glyph="✓"
              title={emptyMessage}
              footnote={filter === "queue" ? lastArrivalFootnote(data ?? []) : undefined}
            />
          ),
        })}
        initialNumToRender={6}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
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
    case "dispatched": {
      // SY24 — "Dispatched today" only. Yesterday's ships clutter
      // the tab; the shop-floor question is "did we ship today?".
      if (o.currentStatus !== "DISPATCHED") return false;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return new Date(o.createdAt).getTime() >= start.getTime();
    }
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

function lastArrivalFootnote(rows: { createdAt: string }[]): string | undefined {
  if (rows.length === 0) return undefined;
  const latest = rows.reduce(
    (a, b) => (a.createdAt > b.createdAt ? a : b),
    rows[0],
  );
  const ms = Date.now() - Date.parse(latest.createdAt);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return t("factoryHome.lastOrderArrived", { when: timeAgo(latest.createdAt) });
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
      title: t("common.awaitingAdminApproval"),
      body: t("factoryHome.anAdminMustApproveBefore"),
      chase: t("factoryHome.chaseAdmin"),
    };
  }
  if (row.currentStatus === "ON_HOLD") {
    return {
      title: t("common.onHold"),
      body:
        [row.holdReasonCategory ? holdReasonLabel(row.holdReasonCategory) : null, row.holdReason]
          .filter(Boolean)
          .join(" — ") || t("factoryHome.noReasonRecorded"),
      chase:
        row.salesperson?.ownerName
          ? t("factoryHome.chasePerson", {
              name: row.salesperson.phone
                ? `${row.salesperson.ownerName} (${row.salesperson.phone})`
                : row.salesperson.ownerName,
            })
          : t("factoryHome.chaseSalesperson"),
    };
  }
  if (row.needsRateApproval) {
    return {
      title: t("factoryHome.belowFloorRate"),
      body: t("factoryHome.oneOrMoreLinesAre"),
      chase: t("factoryHome.chaseAdmin"),
    };
  }
  return { title: t("factoryHome.blocked"), body: t("factoryHome.unknownReason"), chase: "" };
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
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
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  list: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
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
