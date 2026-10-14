import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { differenceInCalendarDays } from "date-fns";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { listEmpty } from "@/components/ListStates";
import { CustomerActions } from "@/components/CustomerActions";
import { PromiseSheet } from "@/components/PromiseSheet";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { shareStatement } from "@/lib/statement";
import { useDuesForParty, useLatestTallySync } from "@/lib/queries";
import { useCustomer } from "@/lib/followup-queries";
import { formatDate, formatINR, timeAgo } from "@/lib/format";
import { t, tn } from "@/lib/i18n";
import { theme } from "@/theme";

// One customer: what they owe, invoice by invoice, with the same four
// follow-up buttons as the Today tab.
export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customer = useCustomer(id ?? null);
  const dues = useDuesForParty(id ?? null);
  const { data: sync } = useLatestTallySync();
  const [refreshing, setRefreshing] = useState(false);
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const refetchAll = useCallback(async () => {
    await Promise.all([customer.refetch(), dues.refetch()]);
  }, [customer.refetch, dues.refetch]);

  useFocusEffect(
    useCallback(() => {
      void refetchAll();
    }, [refetchAll]),
  );

  const now = new Date();
  const invoices = dues.data ?? [];
  const pendingOf = (inv: (typeof invoices)[number]) =>
    Number(inv.totalAmount) - Number(inv.paidAmount) - Number(inv.creditedAmount);

  const total = useMemo(
    () =>
      invoices.reduce((acc, inv) => {
        const p = pendingOf(inv);
        return acc + (Number.isFinite(p) ? p : 0);
      }, 0),
    [invoices],
  );
  const daysOverdue = useMemo(
    () =>
      invoices.reduce(
        (max, inv) =>
          Math.max(max, differenceInCalendarDays(now, new Date(inv.dueDate))),
        0,
      ),
    [invoices],
  );

  const c = customer.data;
  const outstanding = c && c.outstanding > 0 ? c.outstanding : total;

  return (
    <Screen padded={false}>
      <PageHeader
        title={c?.name ?? t("dues.title")}
        subtitle={c?.city ?? undefined}
        fallback="/(staff)/customers"
      />
      <FlatList
        data={invoices}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          c ? (
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>{t("dues.total")}</Text>
              <Text style={styles.summaryTotal}>{formatINR(outstanding)}</Text>
              <Text style={styles.syncLabel}>
                {sync?.completedAt
                  ? t("dues.updated", { time: timeAgo(sync.completedAt) })
                  : t("dues.updatedNever")}
              </Text>
              <CustomerActions
                customer={{
                  id: c.id,
                  name: c.name,
                  phone: c.phone,
                  outstanding,
                  daysOverdue,
                }}
                onPromise={() => setPromiseOpen(true)}
              />
              <Button
                label={t("statement.share")}
                variant="secondary"
                loading={sharing}
                accessibilityLabel={t("statement.shareA11y", { name: c.name })}
                onPress={async () => {
                  setSharing(true);
                  const res = await shareStatement(c.id, c.name);
                  setSharing(false);
                  if ("error" in res) toast.error(res.error);
                }}
              />
              <Text style={styles.sectionTitle}>{t("dues.invoices")}</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const dueDate = new Date(item.dueDate);
          const late = differenceInCalendarDays(now, dueDate);
          const overdue = late > 0 && item.status !== "PAID";
          return (
            <View style={[styles.invoice, overdue && styles.invoiceOverdue]}>
              <View style={styles.invoiceTop}>
                <Text style={styles.invNumber}>{item.invoiceNumber}</Text>
                <Text style={styles.invAmount}>{formatINR(pendingOf(item))}</Text>
              </View>
              <Text style={[styles.invDue, overdue && styles.invDueOverdue]}>
                {overdue
                  ? tn("today.daysOverdue", late)
                  : t("dues.dueOn", { date: formatDate(dueDate) })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={listEmpty({
          loading: dues.loading && !dues.data,
          error: dues.data ? null : dues.error,
          onRetry: () => void refetchAll(),
          skeletonCount: 3,
          empty: <EmptyState glyph="✓" title={t("dues.empty")} />,
        })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await refetchAll();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      />
      <PromiseSheet
        party={promiseOpen && c ? { id: c.id, name: c.name, outstanding } : null}
        onClose={() => setPromiseOpen(false)}
        onSaved={() => void refetchAll()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.lg, flexGrow: 1 },
  summary: { gap: 6, marginBottom: theme.spacing.sm },
  summaryLabel: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  summaryTotal: {
    fontSize: 34,
    fontWeight: "800",
    color: theme.colors.primary,
    fontVariant: ["tabular-nums"],
  },
  syncLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    marginTop: theme.spacing.md,
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.text,
  },
  invoice: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  invoiceOverdue: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
  },
  invoiceTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: 12,
  },
  invNumber: {
    flex: 1,
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  invAmount: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  invDue: { fontSize: theme.type.bodySmall, color: theme.colors.textMuted },
  invDueOverdue: { color: theme.colors.danger, fontWeight: "700" },
});
