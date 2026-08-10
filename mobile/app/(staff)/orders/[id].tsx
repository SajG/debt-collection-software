import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { useAuth } from "@/auth/AuthContext";
import { useOrderDetail, useOrderEventStream } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data, loading, error, refetch } = useOrderDetail(id ?? null);
  // Timeline auto-updates as new events land on this or any of the
  // user's orders.
  useOrderEventStream(refetch, user?.id ?? null);

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.error}>{t("detail.notFound")}</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{data.orderNumber}</Text>
            <Text style={styles.subtitle}>{data.party?.name ?? "—"}</Text>
          </View>
          <StatusBadge status={data.currentStatus} size="lg" />
        </View>

        <View style={styles.cards}>
          <InfoCard label={t("detail.product")}>
            <Text style={styles.value}>{data.product?.name ?? "—"}</Text>
            {data.brand ? (
              <Text style={styles.sub}>{data.brand}</Text>
            ) : null}
          </InfoCard>

          <InfoCard label={t("detail.quantity")}>
            <Text style={styles.valueBig}>
              {data.quantity.toString()}{" "}
              <Text style={styles.valueUnit}>{data.quantityUnit}</Text>
            </Text>
            <Text style={styles.sub}>
              {data.packingType} · {data.sizeKg} kg
            </Text>
          </InfoCard>

          <InfoCard label={t("detail.rate")}>
            <Text style={styles.value}>{data.productRate}</Text>
          </InfoCard>

          <InfoCard label={t("detail.expected")}>
            <Text style={styles.value}>{formatDate(data.expectedDeliveryDate)}</Text>
          </InfoCard>

          <InfoCard label={t("detail.payment")}>
            <Text style={styles.value}>{data.paymentTerm.replace(/_/g, " ")}</Text>
          </InfoCard>

          <InfoCard label={t("detail.transport")}>
            <Text style={styles.value}>{data.transportType.replace(/_/g, " ")}</Text>
          </InfoCard>
        </View>

        {data.notes ? (
          <View style={[styles.notesCard]}>
            <Text style={styles.label}>{t("detail.notes")}</Text>
            <Text style={styles.notes}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.timelineHeader}>{t("detail.timeline")}</Text>
        <Timeline events={data.events} currentStatus={data.currentStatus} />
      </ScrollView>
    </Screen>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    fontSize: theme.type.body,
    color: theme.colors.danger,
    textAlign: "center",
    marginTop: theme.spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    marginTop: 4,
  },
  cards: {
    gap: theme.spacing.sm,
  },
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
  },
  valueBig: {
    fontSize: 26,
    color: theme.colors.text,
    fontWeight: "700",
  },
  valueUnit: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  sub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  notesCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    gap: 6,
  },
  notes: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    lineHeight: 24,
  },
  timelineHeader: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
});
