import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { TabHeader } from "@/components/TabHeader";
import { TextField } from "@/components/TextField";
import { EmptyState } from "@/components/EmptyState";
import { FAB } from "@/components/FAB";
import { listEmpty } from "@/components/ListStates";
import { useAuth } from "@/auth/AuthContext";
import { useCustomers, type CustomerRow } from "@/lib/followup-queries";
import { formatINR } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Fixed row height lets FlatList skip measuring — a ledger can run to
// several hundred customers. Text is single-line so the height holds at
// the 1.3× font cap.
const ROW_HEIGHT = 76;
const ROW_GAP = 8;

export default function CustomersScreen() {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const { data, loading, error, refetch } = useCustomers(search);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return (
    <Screen padded={false} edges={["top", "left", "right"]}>
      <TabHeader title={t("tabs.customers")} subtitle={t("customers.subtitle")} />
      <View style={styles.searchWrap}>
        <TextField
          label={t("dues.search")}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t("dues.search")}
        />
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        getItemLayout={(_, index) => ({
          length: ROW_HEIGHT + ROW_GAP,
          offset: (ROW_HEIGHT + ROW_GAP) * index,
          index,
        })}
        initialNumToRender={10}
        windowSize={9}
        removeClippedSubviews
        renderItem={({ item }) => <CustomerRowView row={item} />}
        ListEmptyComponent={listEmpty({
          loading: loading && !data,
          error: data ? null : error,
          onRetry: () => void refetch(),
          empty: (
            <EmptyState
              glyph="☺"
              title={search ? t("customers.noMatch") : t("customers.empty")}
              body={search ? undefined : t("customers.emptyBody")}
            />
          ),
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      />
      {role === "ADMIN" ? (
        <FAB
          label={t("customers.add")}
          onPress={() => router.push("/(staff)/customers/new")}
        />
      ) : null}
    </Screen>
  );
}

function CustomerRowView({ row }: { row: CustomerRow }) {
  const owes = row.outstanding > 0;
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/(staff)/customers/[id]", params: { id: row.id } })
      }
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={
        owes
          ? t("customers.rowA11yOwes", { name: row.name, amount: formatINR(row.outstanding) })
          : t("customers.rowA11yClear", { name: row.name })
      }
    >
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {row.city ?? " "}
        </Text>
      </View>
      <Text style={[styles.amount, !owes && styles.amountClear]} numberOfLines={1}>
        {owes ? formatINR(row.outstanding) : t("customers.nothingDue")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 112,
    flexGrow: 1,
  },
  row: {
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: { flex: 1 },
  name: { fontSize: theme.type.body, fontWeight: "700", color: theme.colors.text },
  sub: { fontSize: 14, color: theme.colors.textMuted, marginTop: 2 },
  amount: {
    fontSize: theme.type.bodySmall,
    fontWeight: "800",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  amountClear: { color: theme.colors.textMuted, fontWeight: "600" },
});
