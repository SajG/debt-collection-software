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
import { FAB } from "@/components/FAB";
import { confirm } from "@/components/Confirm";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { useOrderEventStream, useOwnOrders } from "@/lib/queries";
import type { QuantityUnit } from "@/lib/database.types";
import { useQueue } from "@/lib/order-queue";
import { useDocQueue } from "@/lib/order-doc-queue";
import { useStatusQueue } from "@/lib/status-queue";
import { useDraftPreview } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
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
  const { profile, user, role, signOut } = useAuth();
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
      quantity: it.payload.p_quantity,
      quantityUnit: it.payload.p_quantity_unit,
    }));
    const server: Row[] = (data ?? []).map((o) => ({
      kind: "server",
      key: `s:${o.id}`,
      id: o.id,
      partyName: o.party?.name ?? "—",
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
          ? (o.salesperson?.ownerName ?? null)
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
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.hello} numberOfLines={1}>
            {t("home.greeting", { name: profile?.ownerName ?? "" })}
          </Text>
          <Text style={styles.subtitle}>{t("home.subtitle")}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/(staff)/settings")}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Text style={styles.iconBtnGlyph}>⚙</Text>
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
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("home.signOut")}
          >
            <Text style={styles.signOutGlyph}>⏻</Text>
          </Pressable>
        </View>
      </View>

      {pendingUnsent > 0 && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            {pendingUnsent} unsent — will send automatically when
            connectivity returns.
          </Text>
        </View>
      )}

      <View style={styles.tilesRow}>
        <NavTile
          glyph="₹"
          label={t("home.dues")}
          onPress={() => router.push("/(staff)/dues")}
        />
        <NavTile
          glyph="◫"
          label="Stock"
          onPress={() => router.push("/(staff)/stock")}
        />
        <NavTile
          glyph="✓"
          label="Payments"
          onPress={() => router.push("/(staff)/payments")}
        />
        {isAdmin && (
          <NavTile
            glyph="+"
            label="Customer"
            onPress={() => router.push("/(staff)/customers/new")}
          />
        )}
      </View>

      {isAdmin && (
        <View style={styles.scopeToggle}>
          <Segmented<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { label: t("home.scope.mine"), value: "mine" },
              { label: t("home.scope.all"), value: "all" },
            ]}
          />
        </View>
      )}

      {draftPreview.hasDraft && (
        <View style={styles.resumeWrap}>
          <Pressable
            onPress={() => router.push("/(staff)/orders/new")}
            style={({ pressed }) => [
              styles.resumeCard,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeLabel}>Resume order</Text>
              <Text style={styles.resumeSummary} numberOfLines={1}>
                {draftPreview.summary ?? "Draft in progress"}
              </Text>
              <Text style={styles.resumeMeta}>
                Step {draftPreview.lastStep} of 12
              </Text>
            </View>
            <Text style={styles.resumeChevron}>›</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.filters}>
        <Segmented<Filter>
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
            />
          )
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>{error ? t("home.error") : emptyMessage}</Text>
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

      <FAB
        label={t("home.newOrder")}
        onPress={() => router.push("/(staff)/orders/new")}
      />
    </Screen>
  );
}

function NavTile({
  glyph,
  label,
  onPress,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.tileGlyph}>{glyph}</Text>
      <Text
        style={styles.tileLabel}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </Pressable>
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
  headerText: { flex: 1, gap: 4 },
  hello: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
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
  iconBtnGlyph: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  signOutGlyph: {
    fontSize: 16,
    color: theme.colors.danger,
    fontWeight: "700",
  },
  pendingBanner: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  pendingText: {
    fontSize: theme.type.bodySmall,
    color: "#78350F",
    fontWeight: "600",
  },
  tilesRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  tile: {
    flex: 1,
    minHeight: 76,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  tileGlyph: {
    fontSize: 26,
    color: theme.colors.primary,
    fontWeight: "700",
    lineHeight: 30,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.text,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  scopeToggle: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  filters: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  list: {
    padding: theme.spacing.lg,
    paddingBottom: 140, // clear space for the FAB
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
  resumeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: "#EAF2EF",
  },
  resumeLabel: {
    fontSize: 12,
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
