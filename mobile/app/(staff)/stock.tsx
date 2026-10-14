import { useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { useStock, type StockRow } from "@/lib/stock-queries";
import { timeAgo } from "@/lib/format";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { listEmpty } from "@/components/ListStates";
import { EmptyState } from "@/components/EmptyState";

export default function StockScreen() {
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useStock(search);
  const [refreshing, setRefreshing] = useState(false);

  const latestSync = (data ?? [])
    .map((r) => r.lastSyncedAt)
    .filter((s): s is string => Boolean(s))
    .sort()
    .reverse()[0];

  return (
    <Screen padded={false}>
      <PageHeader
        title={t("staffStock.stockInFactory")}
        subtitle={
          latestSync
            ? t("staffStock.lastTallySync", { latestSync: timeAgo(latestSync) })
            : t("staffStock.stockLevelsComeFromTally")
        }
      />

      <View style={styles.searchWrap}>
        <TextField
          label={t("staffStock.search")}
          placeholder={t("staffStock.productOrCategory")}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        windowSize={9}
        removeClippedSubviews
        renderItem={({ item }) => <StockRowView row={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={listEmpty({
          loading: loading && !data,
          error: data ? null : error,
          onRetry: () => void refetch(),
          empty: (
            <EmptyState
              glyph="▦"
              title={
                search
                  ? t("staffStock.noStockItemsMatchYour")
                  : t("staffStock.stockLevelsComeFromTally2")
              }
            />
          ),
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await refetch();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      />
    </Screen>
  );
}

function StockRowView({ row }: { row: StockRow }) {
  const qty = row.closingQty;
  const tone = qty <= 0 ? "danger" : qty < 10 ? "warn" : "ok";
  const label = qty <= 0 ? t("stock.out") : qty < 10 ? t("stock.low") : t("stock.in");

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{row.name}</Text>
        {row.category ? (
          <Text style={styles.category}>{row.category}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.qty, tone === "danger" && { color: theme.colors.danger }]}>
          {qty.toLocaleString("en-IN")}{" "}
          <Text style={styles.unit}>{row.unit ?? ""}</Text>
        </Text>
        <View
          style={[
            styles.pill,
            tone === "danger"
              ? styles.pillDanger
              : tone === "warn"
                ? styles.pillWarn
                : styles.pillOk,
          ]}
        >
          <Text
            style={[
              styles.pillText,
              tone === "danger"
                ? styles.pillTextDanger
                : tone === "warn"
                  ? styles.pillTextWarn
                  : styles.pillTextOk,
            ]}
          >
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: theme.spacing.md,
    paddingBottom: 0,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "800",
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  searchWrap: {
    padding: theme.spacing.md,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  sep: { height: theme.spacing.xs },
  center: {
    padding: theme.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: theme.colors.danger, fontSize: theme.type.body },
  row: {
    flexDirection: "row",
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.sm,
  },
  name: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  category: {
    marginTop: 2,
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
  right: { alignItems: "flex-end" },
  qty: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  unit: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  pill: {
    marginTop: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillOk: { backgroundColor: "#DCFCE7" },
  pillWarn: { backgroundColor: "#FEF3C7" },
  pillDanger: { backgroundColor: theme.colors.dangerBg },
  pillText: {
    fontSize: theme.type.bodySmall - 2,
    fontWeight: "700",
  },
  pillTextOk: { color: theme.colors.primary },
  pillTextWarn: { color: "#92400E" },
  pillTextDanger: { color: theme.colors.danger },
  emptyWrap: { padding: theme.spacing.xl, alignItems: "center" },
  emptyText: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
});
