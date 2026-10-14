import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { TabHeader } from "@/components/TabHeader";
import { EmptyState } from "@/components/EmptyState";
import { listEmpty } from "@/components/ListStates";
import { paymentMethodLabel } from "@/lib/labels";
import { FAB } from "@/components/FAB";
import { usePayments, type PaymentListRow } from "@/lib/payment-queries";
import { formatDate, formatINR } from "@/lib/format";
import { theme } from "@/theme";
import { t, tn } from "@/lib/i18n";

export default function PaymentsListScreen() {
  const { data, loading, error, refetch } = usePayments();

  // Re-fetch every time the user returns to the tab so a newly-recorded
  // payment shows up without a pull-to-refresh gesture.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const [refreshing, setRefreshing] = useState(false);

  return (
    <Screen padded={false} edges={["top", "left", "right"]}>
      <TabHeader
        title={t("tabs.payments")}
        subtitle={t("staffPaymentsHome.recordedCollectionsAndProofsTap")}
      />
      <FlatList
        contentContainerStyle={styles.list}
        data={data ?? []}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <PaymentRow row={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={listEmpty({
          loading: loading && !data,
          error: data ? null : error,
          onRetry: () => void refetch(),
          empty: (
            <EmptyState
              glyph="₹"
              title={t("staffPaymentsHome.noPaymentsYet")}
              body={t("staffPaymentsHome.tapTheButtonToRecord")}
              actionLabel={t("payments.record")}
              onAction={() => router.push("/(staff)/payments/new")}
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
      <FAB
        label={t("payments.record")}
        onPress={() => router.push("/(staff)/payments/new")}
      />
    </Screen>
  );
}

function PaymentRow({ row }: { row: PaymentListRow }) {
  const missingProof = row.proofCount === 0;
  return (
    <Pressable
      onPress={() => router.push(`/(staff)/payments/${row.id}`)}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.colors.surface },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t("payments.rowA11y", {
        name: row.partyName,
        amount: formatINR(Number(row.amount)),
        date: formatDate(new Date(row.paymentDate)),
      })}
    >
      <View style={styles.rowTop}>
        <Text style={styles.party} numberOfLines={1}>
          {row.partyName}
        </Text>
        <Text style={styles.amount}>{formatINR(Number(row.amount))}</Text>
      </View>
      <View style={styles.rowBottom}>
        <Text style={styles.meta}>
          {formatDate(new Date(row.paymentDate))} · {paymentMethodLabel(row.method)}
          {row.reference ? ` · ${row.reference}` : ""}
        </Text>
        <View
          style={[
            styles.proofPill,
            missingProof ? styles.proofPillWarn : styles.proofPillOk,
          ]}
        >
          <Text
            style={[
              styles.proofPillText,
              missingProof ? styles.proofPillWarnText : styles.proofPillOkText,
            ]}
          >
            {missingProof
              ? t("staffPaymentsHome.noProof")
              : tn("payments.proofs", row.proofCount)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: theme.spacing.md, paddingBottom: 120 },
  sep: { height: theme.spacing.sm },
  row: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: theme.spacing.xs,
  },
  party: {
    flex: 1,
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  amount: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meta: {
    flex: 1,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginRight: theme.spacing.sm,
  },
  proofPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  proofPillOk: { backgroundColor: "#DCFCE7" },
  proofPillWarn: { backgroundColor: theme.colors.dangerBg },
  proofPillText: {
    fontSize: theme.type.bodySmall - 2,
    fontWeight: "600",
  },
  proofPillOkText: { color: theme.colors.primary },
  proofPillWarnText: { color: theme.colors.danger },
  empty: {
    padding: theme.spacing.xl,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  emptyBody: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  errorBar: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.dangerBg,
  },
  errorText: { color: theme.colors.danger, fontSize: theme.type.body },
});
