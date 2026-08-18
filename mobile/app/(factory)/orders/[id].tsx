import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { confirm } from "@/components/Confirm";
import { useAuth } from "@/auth/AuthContext";
import { useOrderDetail, useOrderEventStream } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import type { OrderStatus } from "@/lib/database.types";
import { theme } from "@/theme";

// Straight-line factory progression. Cancel is a separate destructive
// path so it doesn't get tapped by mistake.
const NEXT_STEP: Partial<Record<OrderStatus, OrderStatus>> = {
  ORDER_PLACED: "IN_PRODUCTION",
  IN_PRODUCTION: "READY_TO_DISPATCH",
  READY_TO_DISPATCH: "LR_GENERATED",
  LR_GENERATED: "DISPATCHED",
};

const STEP_LABEL: Record<OrderStatus, string> = {
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "Start production",
  READY_TO_DISPATCH: "Mark packed / ready",
  LR_GENERATED: "LR generated",
  DISPATCHED: "Mark dispatched",
  CANCELLED: "Cancelled",
};

export default function FactoryOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data, loading, error, refetch } = useOrderDetail(id ?? null);
  useOrderEventStream(refetch, user?.id ?? null);
  const [submitting, setSubmitting] = useState(false);

  const next = useMemo<OrderStatus | null>(
    () => (data ? (NEXT_STEP[data.currentStatus] ?? null) : null),
    [data],
  );

  const advance = useCallback(
    async (target: OrderStatus, note: string) => {
      if (!id || !user) return;
      setSubmitting(true);
      try {
        const { error: upErr } = await supabase
          .from("SalesOrder")
          .update({ currentStatus: target })
          .eq("id", id);
        if (upErr) throw upErr;
        const { error: evErr } = await supabase
          .from("OrderStatusEvent")
          .insert({
            salesOrderId: id,
            status: target,
            notes: note,
            updatedById: user.id,
          });
        if (evErr) throw evErr;
        await refetch();
      } catch (e: any) {
        Alert.alert("Update failed", e?.message ?? "Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [id, user, refetch],
  );

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
        <Text style={styles.error}>Order not found.</Text>
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
            {data.salesperson?.ownerName ? (
              <Text style={styles.by}>
                Placed by {data.salesperson.ownerName}
              </Text>
            ) : null}
          </View>
          <StatusBadge status={data.currentStatus} size="lg" />
        </View>

        <View style={styles.cards}>
          <InfoCard label="Product">
            <Text style={styles.value}>{data.product?.name ?? "—"}</Text>
            {data.brand ? <Text style={styles.sub}>{data.brand}</Text> : null}
          </InfoCard>
          <InfoCard label="Quantity">
            <Text style={styles.value}>
              {data.quantity} {data.quantityUnit}
            </Text>
            <Text style={styles.sub}>
              {data.packingType ?? "—"}
              {data.sizeKg ? ` · ${data.sizeKg} kg` : ""}
            </Text>
          </InfoCard>
          <InfoCard label="Dispatch to">
            <Text style={styles.value}>{data.dispatchLocation ?? "—"}</Text>
          </InfoCard>
          <InfoCard label="Expected delivery">
            <Text style={styles.value}>
              {formatDate(data.expectedDeliveryDate)}
            </Text>
          </InfoCard>
          {data.tokenType ? (
            <InfoCard label="Token / Gift">
              <Text style={styles.value}>{data.tokenType}</Text>
            </InfoCard>
          ) : null}
          {data.notes ? (
            <InfoCard label="Notes">
              <Text style={styles.value}>{data.notes}</Text>
            </InfoCard>
          ) : null}
        </View>

        <View style={styles.actions}>
          {next && data.currentStatus !== "CANCELLED" ? (
            <Button
              label={STEP_LABEL[next]}
              loading={submitting}
              disabled={submitting}
              onPress={() =>
                confirm({
                  title: STEP_LABEL[next],
                  body: `Move ${data.orderNumber} to ${next.replace(/_/g, " ")}?`,
                  confirmLabel: "Confirm",
                  onConfirm: () =>
                    void advance(next, `Factory → ${next}`),
                })
              }
            />
          ) : (
            <Text style={styles.doneLabel}>
              {data.currentStatus === "DISPATCHED"
                ? "Dispatched. Nothing more for factory to do."
                : "No further factory action available."}
            </Text>
          )}
          {data.currentStatus !== "DISPATCHED" &&
            data.currentStatus !== "CANCELLED" && (
              <Button
                variant="secondary"
                label="Cancel order"
                disabled={submitting}
                onPress={() =>
                  confirm({
                    title: "Cancel order?",
                    body: `Mark ${data.orderNumber} as cancelled. This can't be undone from mobile.`,
                    confirmLabel: "Cancel order",
                    destructive: true,
                    onConfirm: () =>
                      void advance("CANCELLED", "Cancelled from factory"),
                  })
                }
              />
            )}
        </View>

        <Timeline events={data.events} currentStatus={data.currentStatus} />
      </ScrollView>
    </Screen>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.danger,
    marginTop: theme.spacing.xl,
  },
  scroll: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
    marginTop: 2,
  },
  by: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cards: { gap: theme.spacing.md },
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 4,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sub: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  actions: { gap: theme.spacing.sm },
  doneLabel: {
    textAlign: "center",
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.md,
  },
});
