import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { TabHeader } from "@/components/TabHeader";
import { EmptyState } from "@/components/EmptyState";
import { listEmpty } from "@/components/ListStates";
import { CustomerActions } from "@/components/CustomerActions";
import { PromiseSheet } from "@/components/PromiseSheet";
import { PushPrompt } from "@/components/PushPrompt";
import { SyncPill } from "@/components/SyncPill";
import { useAuth } from "@/auth/AuthContext";
import { useTodayFollowUps, type FollowUp } from "@/lib/followup-queries";
import { formatDate, formatINR } from "@/lib/format";
import { markFirstScreen } from "@/lib/startup";
import { t, tn } from "@/lib/i18n";
import { theme } from "@/theme";

// Sales "Today": who to talk to about payment, most urgent first
// (broken promises, then amount × days overdue). Each row carries the
// four things a salesperson does next — call, WhatsApp, note a
// promise, record a payment — so the daily round needs no navigation.
export default function TodayScreen() {
  const { profile } = useAuth();
  const { data, loading, error, refetch } = useTodayFollowUps();
  const [refreshing, setRefreshing] = useState(false);
  const [promiseFor, setPromiseFor] = useState<FollowUp | null>(null);

  // Coming back from "Record payment" must show the new balance.
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

  const rows = data ?? [];

  return (
    <Screen padded={false} edges={["top", "left", "right"]}>
      <View onLayout={() => markFirstScreen("today")}>
        <TabHeader
          title={t("tabs.today")}
          subtitle={
            data && rows.length > 0
              ? tn("today.count", rows.length)
              : t("home.greeting", { name: profile?.ownerName ?? "" })
          }
        />
      </View>
      <View style={styles.pillRow}>
        <SyncPill />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.partyId}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={<PushPrompt />}
        ListHeaderComponentStyle={styles.listHeader}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item }) => (
          <FollowUpRow item={item} onPromise={() => setPromiseFor(item)} />
        )}
        ListEmptyComponent={listEmpty({
          loading: loading && !data,
          error: data ? null : error,
          onRetry: () => void refetch(),
          empty: (
            <EmptyState
              glyph="✓"
              title={t("today.empty")}
              body={t("today.emptyBody")}
              actionLabel={t("home.newOrder")}
              onAction={() => router.push("/(staff)/orders/new")}
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

      <PromiseSheet
        party={
          promiseFor
            ? {
                id: promiseFor.partyId,
                name: promiseFor.name,
                outstanding: promiseFor.outstanding,
              }
            : null
        }
        onClose={() => setPromiseFor(null)}
        onSaved={() => void refetch()}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function FollowUpRow({
  item,
  onPromise,
}: {
  item: FollowUp;
  onPromise: () => void;
}) {
  const overdueText =
    item.daysOverdue > 0 ? tn("today.daysOverdue", item.daysOverdue) : t("today.dueNow");
  return (
    <View style={[styles.card, item.brokenPromise && styles.cardUrgent]}>
      <View
        accessible
        accessibilityLabel={t("today.rowA11y", {
          name: item.name,
          amount: formatINR(item.outstanding),
          overdue: overdueText,
        })}
      >
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.amount}>{formatINR(item.outstanding)}</Text>
        </View>
        <Text style={[styles.overdue, item.daysOverdue > 0 && styles.overdueLate]}>
          {overdueText}
          {item.city ? ` · ${item.city}` : ""}
        </Text>
        {item.brokenPromise && item.promiseDate ? (
          <Text style={styles.broken}>
            {t("today.brokenPromise", { date: formatDate(item.promiseDate) })}
          </Text>
        ) : item.promiseDueToday ? (
          <Text style={styles.dueToday}>{t("today.promiseDueToday")}</Text>
        ) : null}
      </View>
      <CustomerActions
        customer={{
          id: item.partyId,
          name: item.name,
          phone: item.phone,
          outstanding: item.outstanding,
          daysOverdue: item.daysOverdue,
          paymentLinkUrl: item.paymentLinkUrl,
        }}
        onPromise={onPromise}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { paddingHorizontal: theme.spacing.lg },
  listHeader: { marginHorizontal: -theme.spacing.lg },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
    flexGrow: 1,
  },
  separator: { height: 12 },
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 12,
  },
  cardUrgent: { borderColor: theme.colors.danger, borderWidth: 2 },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  amount: {
    fontSize: theme.type.body,
    fontWeight: "800",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  overdue: {
    marginTop: 2,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  overdueLate: { color: theme.colors.danger, fontWeight: "700" },
  broken: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.dangerBg,
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "700",
    overflow: "hidden",
  },
  dueToday: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.curBg,
    color: theme.colors.ink,
    fontSize: 14,
    fontWeight: "700",
    overflow: "hidden",
  },
});
