import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { useStock, type StockRow } from "@/lib/stock-queries";
import { timeAgo } from "@/lib/format";
import { theme } from "@/theme";

export default function StockScreen() {
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useStock(search);

  const latestSync = (data ?? [])
    .map((r) => r.lastSyncedAt)
    .filter((s): s is string => Boolean(s))
    .sort()
    .reverse()[0];

  return (
    <Screen padded={false}>
      <PageHeader
        title="Stock in factory"
        subtitle={
          latestSync
            ? `Last Tally sync: ${timeAgo(latestSync)}`
            : "Stock levels come from Tally — this screen will populate once an admin turns Tally on."
        }
      />

      <View style={styles.searchWrap}>
        <TextField
          label="Search"
          placeholder="Product or category…"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <StockRowView row={item} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {search
                  ? "No stock items match your search."
                  : "Stock levels come from Tally. Nothing is tracked here yet — ask an admin to enable the Tally integration."}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void refetch()}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </Screen>
  );
}

function StockRowView({ row }: { row: StockRow }) {
  const qty = row.closingQty;
  const tone = qty <= 0 ? "danger" : qty < 10 ? "warn" : "ok";
  const label = qty <= 0 ? "Out of stock" : qty < 10 ? "Low" : "In stock";

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
    color: theme.colors.success,
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
    fontSize: theme.type.bodySmall - 4,
    fontWeight: "700",
  },
  pillTextOk: { color: theme.colors.success },
  pillTextWarn: { color: "#92400E" },
  pillTextDanger: { color: theme.colors.danger },
  emptyWrap: { padding: theme.spacing.xl, alignItems: "center" },
  emptyText: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
});
