import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TabHeader } from "@/components/TabHeader";
import { EmptyState } from "@/components/EmptyState";
import { listEmpty } from "@/components/ListStates";
import { Segmented } from "@/components/Segmented";
import { OrderCard } from "@/components/OrderCard";
import { FAB } from "@/components/FAB";
import { SyncPill } from "@/components/SyncPill";
import { UpdateBanner } from "@/components/UpdateBanner";
import { useAppUpdates } from "@/lib/app-updates";

// Small wrapper so the update-check hook only runs where the banner
// renders. Keeps the /(staff) home layout the single source of the
// OTA notification without leaking the state into other screens.
function UpdateBannerBinding() {
  const { otaReady, restart } = useAppUpdates();
  return <UpdateBanner visible={otaReady} onRestart={() => void restart()} />;
}
import { confirm } from "@/components/Confirm";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { useOrderEventStream, useOwnOrders } from "@/lib/queries";
import type { QuantityUnit } from "@/lib/database.types";
import { useQueue } from "@/lib/order-queue";
import { useDocQueue } from "@/lib/order-doc-queue";
import { useStatusQueue } from "@/lib/status-queue";
import { clearDraft, useDraftPreview, writeRepeatSeed } from "@/lib/order-draft";
import { supabase } from "@/lib/supabase";
import { t, tn } from "@/lib/i18n";
import { theme } from "@/theme";

type Filter = "all" | "waiting" | "active" | "dispatched";
type Scope = "mine" | "all";

type Row =
  | {
      kind: "queued";
      key: string;
      partyName: string;
      productName: string;
      brand: string | null;
      quantity: number;
      quantityUnit: "KG" | "PCS" | "NOS";
    }
  | {
      kind: "server";
      key: string;
      id: string;
      partyName: string;
      productName: string;
      brand: string | null;
      quantity: string;
      quantityUnit: "KG" | "PCS" | "NOS";
      status:
        | "PENDING_APPROVAL"
        | "ORDER_PLACED"
        | "IN_PRODUCTION"
        | "ON_HOLD"
        | "READY_TO_DISPATCH"
        | "LR_GENERATED"
        | "PARTIALLY_DISPATCHED"
        | "DISPATCHED"
        | "DELIVERED"
        | "REJECTED"
        | "CANCELLED";
      orderNumber: string;
      salespersonName: string | null;
    };

export default function HomeScreen() {
  const { user, role } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  // Scope toggle is ADMIN-only. STAFF is locked to "mine" — RLS enforces
  // that too, but this keeps the client honest and avoids an empty
  // toggle showing up.
  const isAdmin = role === "ADMIN";
  const [scope, setScope] = useState<Scope>("mine");
  const effectiveScope: Scope = isAdmin ? scope : "mine";

  const { data, loading, error, refetch } = useOwnOrders(
    filter,
    effectiveScope,
    user?.id ?? null,
  );
  useOrderEventStream(refetch, user?.id ?? null);
  const queue = useQueue();
  const docQueue = useDocQueue();
  const statusQueue = useStatusQueue();
  const pendingUnsent = queue.length + docQueue.length + statusQueue.length;
  const draftPreview = useDraftPreview();
  useFocusEffect(
    useCallback(() => {
      void draftPreview.refresh();
    }, [draftPreview.refresh]),
  );

  // Repeat-order: fetch the full order + items server-side (the home
  // list only carries a slim projection) and clone into a fresh draft.
  // For a distributor reordering the same basket monthly this turns
  // the 12-step flow into two taps: Repeat → Place order.
  const repeatOrder = useCallback(async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from("SalesOrder")
        .select(
          `partyId, newCustomerName, dispatchLocation, paymentTerm,
           transportType, tokenType,
           party:Party!SalesOrder_partyId_fkey(name),
           items:SalesOrderItem!SalesOrderItem_salesOrderId_fkey(
             lineNumber, productId, brand, quantity, quantityUnit,
             packingType, sizeKg, productRate,
             product:Product!SalesOrderItem_productId_fkey(name)
           )`,
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error || !data) throw error ?? new Error(t("common.orderNotFound"));
      type Row = {
        partyId: string | null;
        newCustomerName: string | null;
        dispatchLocation: string | null;
        paymentTerm: import("@/lib/database.types").PaymentTerm | null;
        transportType: import("@/lib/database.types").TransportType | null;
        tokenType: string | null;
        party: { name: string } | null;
        items: {
          lineNumber: number;
          productId: string;
          brand: string;
          quantity: number | string;
          quantityUnit: string;
          packingType: string | null;
          sizeKg: string | null;
          productRate: string;
          product: { name: string } | null;
        }[];
      };
      const row = data as unknown as Row;
      const sorted = [...(row.items ?? [])].sort(
        (a, b) => a.lineNumber - b.lineNumber,
      );
      await writeRepeatSeed({
        header: {
          partyId: row.partyId,
          partyName: row.party?.name ?? null,
          newCustomerName: row.newCustomerName,
          dispatchLocation: row.dispatchLocation ?? "",
          paymentTerm: row.paymentTerm ?? null,
          transportType: row.transportType ?? null,
          tokenType: row.tokenType ?? null,
        },
        items: sorted.map((it) => ({
          brand: it.brand,
          productId: it.productId,
          productName: it.product?.name ?? null,
          customProductName: null,
          quantity: String(it.quantity),
          quantityUnit: (it.quantityUnit as QuantityUnit) ?? "KG",
          packingType: it.packingType,
          sizeKg: it.sizeKg,
          productRate: it.productRate,
        })),
      });
      router.push("/(staff)/orders/new");
    } catch (e) {
      confirm({
        title: t("staffHome.couldntCloneOrder"),
        body: e instanceof Error ? e.message : t("common.pleaseTryAgain"),
        confirmLabel: "OK",
        onConfirm: () => undefined,
      });
    }
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const rows: Row[] = useMemo(() => {
    // Queued items always at the top so users see their "in flight" work
    // regardless of the current filter.
    const q: Row[] = queue.map((it) => ({
      kind: "queued",
      key: `q:${it.localId}`,
      partyName: it.display.partyName,
      productName: it.display.productName,
      brand: it.display.brand,
      quantity: it.display.totalQuantity,
      quantityUnit: it.display.quantityUnit,
    }));
    const server: Row[] = (data ?? []).map((o) => ({
      kind: "server",
      key: `s:${o.id}`,
      id: o.id,
      partyName: o.party?.name ?? o.newCustomerName ?? "—",
      productName: o.product?.name ?? "—",
      brand: o.brand ?? o.product?.brand ?? null,
      quantity: String(o.quantity),
      quantityUnit: o.quantityUnit as QuantityUnit,
      status: o.currentStatus,
      orderNumber: o.orderNumber,
      // Only surface the "placed by" line when it adds information —
      // the admin's own orders and STAFF-scoped views don't need it.
      salespersonName:
        effectiveScope === "all" && o.salesperson?.id !== user?.id
          ? (o.salesperson?.ownerName ?? t("common.unknownUser"))
          : null,
    }));
    return [...q, ...server];
  }, [queue, data, effectiveScope, user?.id]);

  const emptyMessage =
    filter === "waiting"
      ? t("home.empty.waiting")
      : filter === "active"
      ? t("home.empty.active")
      : filter === "dispatched"
        ? t("home.empty.dispatched")
        : t("home.empty.all");

  return (
    <Screen padded={false} edges={["top", "left", "right"]}>
      <TabHeader title={t("tabs.orders")} subtitle={t("home.subtitle")} />

      <View style={styles.pillRow}>
        <SyncPill />
        <Pressable
          onPress={() => router.push("/(staff)/stock")}
          hitSlop={8}
          style={({ pressed }) => [styles.stockLink, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("staffHome.stock")}
        >
          <Text style={styles.stockLinkText}>{t("staffHome.stock")} ›</Text>
        </Pressable>
      </View>
      <UpdateBannerBinding />

      {isAdmin && (
        <View style={styles.scopeToggle}>
          <Pressable
            accessibilityLabel={t("home.viewing", { scope: scope === "mine" ? t("home.scope.mine") : t("home.scope.all") })}
            onPress={() => setScope(scope === "mine" ? "all" : "mine")}
            style={({ pressed }) => [
              styles.scopeChip,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: scope === "all" }}
          >
            <Text style={styles.scopeChipText}>
              {t("home.viewing", { scope: scope === "mine" ? t("home.scope.mine") : t("home.scope.all") })} ▾
            </Text>
          </Pressable>
        </View>
      )}

      {draftPreview.hasDraft && (
        <View style={styles.resumeWrap}>
          <View style={styles.resumeRow}>
            <Pressable
              onPress={() => router.push("/(staff)/orders/new")}
              style={({ pressed }) => [
                styles.resumeCard,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("staffHome.resumeInProgressOrder")}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeLabel}>{t("staffHome.resumeOrder")}</Text>
                <Text style={styles.resumeSummary} numberOfLines={1}>
                  {draftPreview.summary ?? t("staffHome.draftInProgress")}
                </Text>
                <Text style={styles.resumeMeta}>
                  {draftPreview.itemCount === 0
                    ? t("common.customerDelivery")
                    : tn("common.items", draftPreview.itemCount)}
                </Text>
              </View>
              <Text style={styles.resumeChevron}>›</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                confirm({
                  title: t("staffHome.deleteThisDraft"),
                  body:
                    t("staffHome.everythingTypedForThisOrder"),
                  confirmLabel: t("staffHome.deleteDraft"),
                  destructive: true,
                  onConfirm: async () => {
                    await clearDraft();
                    await draftPreview.refresh();
                  },
                })
              }
              style={({ pressed }) => [
                styles.resumeDeleteBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("staffHome.deleteThisDraft2")}
            >
              <Text style={styles.resumeDeleteGlyph}>×</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.filters}>
        <Segmented<Filter>
          compact
          value={filter}
          onChange={setFilter}
          options={[
            { label: t("home.filter.all"), value: "all" },
            { label: t("home.filter.waiting"), value: "waiting" },
            { label: t("home.filter.active"), value: "active" },
            { label: t("home.filter.dispatched"), value: "dispatched" },
          ]}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) =>
          item.kind === "queued" ? (
            <OrderCard
              pending
              partyName={item.partyName}
              productName={item.productName}
              brand={item.brand}
              quantity={item.quantity}
              quantityUnit={item.quantityUnit}
              status="ORDER_PLACED"
              orderNumber={null}
            />
          ) : (
            <OrderCard
              partyName={item.partyName}
              productName={item.productName}
              brand={item.brand}
              quantity={item.quantity}
              quantityUnit={item.quantityUnit}
              status={item.status}
              orderNumber={item.orderNumber}
              salespersonName={item.salespersonName}
              onPress={() => router.push({ pathname: "/(staff)/orders/[id]", params: { id: item.id } })}
              onRepeat={() => {
                confirm({
                  title: t("staffHome.repeatThisOrder"),
                  body: t("staffHome.opensANewOrderWith"),
                  confirmLabel: t("staffHome.repeat"),
                  onConfirm: () => void repeatOrder(item.id),
                });
              }}
            />
          )
        }
        ListEmptyComponent={listEmpty({
          loading: loading && !data,
          error: data ? null : error ? t("home.error") : null,
          onRetry: () => void refetch(),
          empty: (
            <EmptyState
              glyph="＋"
              title={emptyMessage}
              actionLabel={filter === "all" ? t("home.newOrder") : undefined}
              onAction={filter === "all" ? () => router.push("/(staff)/orders/new") : undefined}
            />
          ),
        })}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      />

      <FAB
        label={t("home.newOrder")}
        onPress={() => router.push("/(staff)/orders/new")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
  },
  stockLink: { minHeight: 48, justifyContent: "center" },
  stockLinkText: {
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  scopeToggle: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    alignItems: "flex-start",
  },
  scopeChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  scopeChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  filters: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    paddingBottom: 96, // clear space for the FAB
  },
  empty: {
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xl,
  },
  resumeWrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  resumeRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  resumeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: "#EAF2EF",
  },
  resumeDeleteBtn: {
    width: 44,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeDeleteGlyph: {
    fontSize: 24,
    lineHeight: 24,
    color: theme.colors.danger,
    fontWeight: "800",
  },
  resumeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resumeSummary: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 2,
  },
  resumeMeta: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  resumeChevron: {
    fontSize: 28,
    color: theme.colors.primary,
    fontWeight: "700",
  },
});
