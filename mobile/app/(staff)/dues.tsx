import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { differenceInCalendarDays } from "date-fns";
import { Screen } from "@/components/Screen";
import { WizardHeader as Header } from "@/components/WizardHeader";
import { TextField } from "@/components/TextField";
import {
  useDuesForParty,
  useLatestTallySync,
  useParties,
  type PartyRow,
} from "@/lib/queries";
import { formatDate, formatINR, timeAgo } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function DuesScreen() {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PartyRow | null>(null);

  const { data: parties, loading: partiesLoading } = useParties(search);
  const { data: dues, loading: duesLoading } = useDuesForParty(picked?.id ?? null);
  const { data: sync } = useLatestTallySync();

  const total = useMemo(() => {
    if (!dues) return 0;
    return dues.reduce((acc, inv) => {
      const pending =
        Number(inv.totalAmount) -
        Number(inv.paidAmount) -
        Number(inv.creditedAmount);
      return acc + (Number.isFinite(pending) ? pending : 0);
    }, 0);
  }, [dues]);

  const now = new Date();
  const syncedLabel = sync?.completedAt
    ? t("dues.updated", { time: timeAgo(sync.completedAt) })
    : t("dues.updatedNever");

  return (
    <Screen padded={false}>
      {/* Reuse WizardHeader's progress-bar-less variant would be neater —
          keeping the module lean by using a small local header here. */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(staff)"))}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
        >
          <Text style={styles.backGlyph}>‹</Text>
          <Text style={styles.backLabel}>{t("wizard.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("dues.title")}</Text>
        <Text style={styles.subtitle}>{t("dues.subtitle")}</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextField
          label={t("dues.search")}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            // If they start typing again, clear the picked row so the
            // list reappears without an extra tap.
            if (picked) setPicked(null);
          }}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      {!picked ? (
        <FlatList
          data={parties ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setPicked(item)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.rowName}>{item.name}</Text>
              {item.city ? <Text style={styles.rowSub}>{item.city}</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            partiesLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <Text style={styles.empty}>{t("dues.pickCustomer")}</Text>
            )
          }
        />
      ) : (
        <FlatList
          data={dues ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>
                {picked.name} · {t("dues.total")}
              </Text>
              <Text style={styles.summaryTotal}>{formatINR(total)}</Text>
              <Text style={styles.syncLabel}>{syncedLabel}</Text>
              <Pressable onPress={() => setPicked(null)} hitSlop={8}>
                <Text style={styles.changeCustomer}>{t("wizard.review.change")}</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const dueDate = new Date(item.dueDate);
            const daysOverdue = differenceInCalendarDays(now, dueDate);
            const overdue = daysOverdue > 0 && item.status !== "PAID";
            const pending =
              Number(item.totalAmount) -
              Number(item.paidAmount) -
              Number(item.creditedAmount);
            return (
              <View
                style={[styles.invoice, overdue && styles.invoiceOverdue]}
              >
                <View style={styles.invoiceTop}>
                  <Text style={styles.invNumber}>{item.invoiceNumber}</Text>
                  <Text style={styles.invAmount}>{formatINR(pending)}</Text>
                </View>
                <Text
                  style={[styles.invDue, overdue && styles.invDueOverdue]}
                >
                  {overdue
                    ? t("dues.overdue", { days: daysOverdue })
                    : t("dues.dueOn", { date: formatDate(dueDate) })}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={
            duesLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <Text style={styles.empty}>{t("dues.empty")}</Text>
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.sm, gap: 4 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: theme.tap,
    minWidth: theme.tap,
    marginLeft: -8,
    gap: 4,
  },
  backGlyph: { fontSize: 28, color: theme.colors.primary, lineHeight: 28 },
  backLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  searchWrap: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  center: { alignItems: "center", justifyContent: "center", padding: theme.spacing.lg },
  list: { padding: theme.spacing.lg, paddingTop: 0 },
  row: {
    minHeight: theme.tap,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  rowName: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowSub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  summary: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.md,
    gap: 4,
  },
  summaryLabel: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
    fontWeight: "600",
  },
  summaryTotal: {
    fontSize: 34,
    fontWeight: "700",
    color: theme.colors.primary,
    marginTop: 4,
  },
  syncLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  changeCustomer: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
    marginTop: theme.spacing.sm,
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
    backgroundColor: "#FEF2F2",
  },
  invoiceTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  invNumber: {
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
  invDue: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  invDueOverdue: {
    color: theme.colors.danger,
    fontWeight: "700",
  },
  empty: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginTop: theme.spacing.xl,
  },
});
