import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { OrderCard } from "@/components/OrderCard";
import { confirm } from "@/components/Confirm";
import { useAuth } from "@/auth/AuthContext";
import { useOrderEventStream, useOwnOrders } from "@/lib/queries";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

type Filter = "queue" | "in_production" | "ready" | "dispatched";

// Factory home: every open order across all salespeople, grouped by
// production stage. Tap → factory detail (status advance). No FAB —
// factory doesn't create orders.
export default function FactoryHome() {
  const { profile, user, signOut } = useAuth();
  const [filter, setFilter] = useState<Filter>("queue");

  // scope="all" is fine — FACTORY's RLS returns every SalesOrder anyway.
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

  const rows = useMemo(() => {
    const src = data ?? [];
    switch (filter) {
      case "queue":
        return src.filter((o) => o.currentStatus === "ORDER_PLACED");
      case "in_production":
        return src.filter((o) => o.currentStatus === "IN_PRODUCTION");
      case "ready":
        return src.filter(
          (o) =>
            o.currentStatus === "READY_TO_DISPATCH" ||
            o.currentStatus === "LR_GENERATED",
        );
      case "dispatched":
        return src.filter((o) => o.currentStatus === "DISPATCHED");
    }
  }, [data, filter]);

  const emptyMessage =
    filter === "queue"
      ? "No new orders waiting."
      : filter === "in_production"
        ? "Nothing on the shop floor right now."
        : filter === "ready"
          ? "No orders packed and waiting to dispatch."
          : "No dispatched orders in the last 200 rows.";

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.hello} numberOfLines={1}>
            Factory · {profile?.ownerName ?? ""}
          </Text>
          <Text style={styles.subtitle}>
            All salesperson orders. Advance production stage on tap.
          </Text>
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
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t("home.signOut")}
        >
          <Text style={styles.signOutGlyph}>⏻</Text>
          <Text style={styles.signOutText}>{t("home.signOut")}</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { label: "Queue", value: "queue" },
            { label: "In prod", value: "in_production" },
            { label: "Ready", value: "ready" },
            { label: "Dispatched", value: "dispatched" },
          ]}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <OrderCard
            partyName={item.party?.name ?? "—"}
            productName={item.product?.name ?? "—"}
            brand={item.brand ?? item.product?.brand ?? null}
            quantity={String(item.quantity)}
            quantityUnit={item.quantityUnit}
            status={item.currentStatus}
            orderNumber={item.orderNumber}
            salespersonName={item.salesperson?.ownerName ?? null}
            onPress={() =>
              router.push({
                pathname: "/(factory)/orders/[id]",
                params: { id: item.id },
              })
            }
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {error ? t("home.error") : emptyMessage}
            </Text>
          ) : null
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

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  hello: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  linkBtn: { minHeight: theme.tap - 8, justifyContent: "center" },
  linkText: {
    fontSize: 15,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    minHeight: theme.tap,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  signOutGlyph: {
    fontSize: 16,
    color: theme.colors.danger,
    fontWeight: "700",
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  filters: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
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
});
