import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { Button } from "@/components/Button";
import { confirm } from "@/components/Confirm";
import { useWizard, isDraftComplete } from "@/lib/order-draft";
import { useConnectivity } from "@/lib/connectivity";
import { enqueue } from "@/lib/order-queue";
import { supabase } from "@/lib/supabase";
import { formatDate, formatINR } from "@/lib/format";
import { usePartyCredit } from "@/lib/stock-queries";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

function parseRate(raw: string): number {
  const m = raw.replace(/[₹,\s]/g, "").match(/-?[\d.]+/);
  return m ? Number(m[0]) : 0;
}

type RouteName =
  | "/(staff)/orders/new/customer"
  | "/(staff)/orders/new/dispatch"
  | "/(staff)/orders/new/brand"
  | "/(staff)/orders/new/product"
  | "/(staff)/orders/new/quantity"
  | "/(staff)/orders/new/packing"
  | "/(staff)/orders/new/rate"
  | "/(staff)/orders/new/terms"
  | "/(staff)/orders/new/delivery"
  | "/(staff)/orders/new/token"
  | "/(staff)/orders/new/notes";

const CHANGE_ROUTES: Record<string, RouteName> = {
  customer: "/(staff)/orders/new/customer",
  dispatch: "/(staff)/orders/new/dispatch",
  brand: "/(staff)/orders/new/brand",
  product: "/(staff)/orders/new/product",
  quantity: "/(staff)/orders/new/quantity",
  packing: "/(staff)/orders/new/packing",
  rate: "/(staff)/orders/new/rate",
  terms: "/(staff)/orders/new/terms",
  delivery: "/(staff)/orders/new/delivery",
  token: "/(staff)/orders/new/token",
  notes: "/(staff)/orders/new/notes",
};

export default function StepReview() {
  const { draft, discard } = useWizard();
  const { online } = useConnectivity();
  const [submitting, setSubmitting] = useState(false);
  const { data: credit } = usePartyCredit(draft.partyId ?? null);

  const complete = isDraftComplete(draft);

  const orderValue =
    (Number(draft.quantity) || 0) * parseRate(draft.productRate);
  const projected = (credit?.totalOutstanding ?? 0) + orderValue;
  const overLimit =
    credit?.creditLimit != null && projected > credit.creditLimit;

  async function submit() {
    if (!complete) {
      Alert.alert(t("wizard.review.title"), t("wizard.review.missing"));
      return;
    }
    setSubmitting(true);

    const rpcPayload = {
      p_party_id: draft.partyId,
      p_new_customer_name: draft.newCustomerName,
      p_dispatch_location: draft.dispatchLocation.trim() || null,
      p_product_id: draft.productId!,
      p_brand: draft.brand,
      p_quantity: Number(draft.quantity),
      p_quantity_unit: draft.quantityUnit,
      p_packing_type: draft.packingType!,
      p_size_kg: draft.sizeKg!,
      p_product_rate: draft.productRate.trim(),
      p_payment_term: draft.paymentTerm!,
      p_transport_type: draft.transportType!,
      p_expected_delivery_date: draft.expectedDeliveryDate,
      p_token_type: draft.tokenType,
      p_notes: draft.notes.trim() ? draft.notes.trim() : null,
    } as const;

    const display = {
      partyName: draft.partyName ?? "",
      productName: draft.productName ?? "",
      brand: draft.brand,
      quantity: Number(draft.quantity),
      quantityUnit: draft.quantityUnit,
      currentStatus: "ORDER_PLACED" as const,
    };

    if (!online) {
      await enqueue(rpcPayload, display);
      await finishOffline();
      return;
    }

    try {
      const { error } = await supabase.rpc("create_sales_order", rpcPayload);
      if (error) throw new Error(error.message);
      await finishOnline();
    } catch (e) {
      // Any RPC failure treated as network-ish: queue and let drainer retry.
      // (A hard schema error will surface in the queued row's lastError.)
      await enqueue(rpcPayload, display);
      await finishOffline();
    } finally {
      setSubmitting(false);
    }
  }

  async function finishOnline() {
    await discard();
    Alert.alert(t("wizard.review.title"), t("wizard.review.submittedOnline"));
    router.replace("/(staff)");
  }

  async function finishOffline() {
    await discard();
    Alert.alert(t("wizard.review.title"), t("wizard.review.submittedOffline"));
    router.replace("/(staff)");
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={12} title={t("wizard.review.title")} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {credit && (
          <View
            style={[
              styles.creditCard,
              overLimit && styles.creditCardDanger,
            ]}
          >
            <Text style={styles.creditTitle}>Credit position</Text>
            <View style={styles.creditRow}>
              <Text style={styles.creditLabel}>Outstanding</Text>
              <Text style={styles.creditValue}>
                {formatINR(credit.totalOutstanding)}
              </Text>
            </View>
            <View style={styles.creditRow}>
              <Text style={styles.creditLabel}>This order</Text>
              <Text style={styles.creditValue}>{formatINR(orderValue)}</Text>
            </View>
            <View style={styles.creditRow}>
              <Text style={styles.creditLabel}>Projected total</Text>
              <Text
                style={[
                  styles.creditValue,
                  { fontWeight: "800" as const },
                ]}
              >
                {formatINR(projected)}
              </Text>
            </View>
            {credit.creditLimit != null && (
              <View style={styles.creditRow}>
                <Text style={styles.creditLabel}>Credit limit</Text>
                <Text style={styles.creditValue}>
                  {formatINR(credit.creditLimit)}
                </Text>
              </View>
            )}
            {overLimit && (
              <Text style={styles.creditWarn}>
                Credit limit will be exceeded — admin may need to override.
                Consider collecting outstanding first.
              </Text>
            )}
            {credit.creditDays != null && (
              <Text style={styles.creditHint}>
                Agreed credit period: {credit.creditDays} days.
              </Text>
            )}
          </View>
        )}
        <Row label={t("wizard.review.customer")} value={draft.partyName} to={CHANGE_ROUTES.customer} />
        <Row label="Dispatch location" value={draft.dispatchLocation || null} to={CHANGE_ROUTES.dispatch} />
        <Row label={t("wizard.review.brand")} value={draft.brand} to={CHANGE_ROUTES.brand} />
        <Row label={t("wizard.review.product")} value={draft.productName} to={CHANGE_ROUTES.product} />
        <Row
          label={t("wizard.review.quantity")}
          value={
            draft.quantity ? `${draft.quantity} ${draft.quantityUnit}` : null
          }
          to={CHANGE_ROUTES.quantity}
        />
        <Row label={t("wizard.review.packing")} value={draft.packingType} to={CHANGE_ROUTES.packing} />
        <Row
          label={t("wizard.review.size")}
          value={draft.sizeKg ? `${draft.sizeKg} kg` : null}
          to={CHANGE_ROUTES.packing}
        />
        <Row label={t("wizard.review.rate")} value={draft.productRate || null} to={CHANGE_ROUTES.rate} />
        <Row
          label={t("wizard.review.payment")}
          value={draft.paymentTerm?.replace(/_/g, " ") ?? null}
          to={CHANGE_ROUTES.terms}
        />
        <Row
          label={t("wizard.review.transport")}
          value={draft.transportType?.replace(/_/g, " ") ?? null}
          to={CHANGE_ROUTES.terms}
        />
        <Row
          label={t("wizard.review.delivery")}
          value={formatDate(draft.expectedDeliveryDate)}
          to={CHANGE_ROUTES.delivery}
        />
        <Row label="Token / Gift" value={draft.tokenType} to={CHANGE_ROUTES.token} />
        <Row label={t("wizard.review.notes")} value={draft.notes || "—"} to={CHANGE_ROUTES.notes} />

        <View style={{ height: theme.spacing.md }} />

        <Button
          label={submitting ? t("wizard.review.submitting") : t("wizard.review.submit")}
          loading={submitting}
          disabled={!complete || submitting}
          onPress={() =>
            confirm({
              title: t("confirm.submit.title"),
              body: t("confirm.submit.body"),
              confirmLabel: t("confirm.submit.ok"),
              onConfirm: submit,
            })
          }
        />
      </ScrollView>
    </Screen>
  );
}

function Row({
  label,
  value,
  to,
}: {
  label: string;
  value: string | null | undefined;
  to: RouteName;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value ?? "—"}</Text>
      </View>
      <Pressable
        onPress={() => router.push(to)}
        hitSlop={12}
        style={({ pressed }) => [styles.changeBtn, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
      >
        <Text style={styles.changeText}>{t("wizard.review.change")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
    marginTop: 2,
  },
  changeBtn: {
    minHeight: theme.tap,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  changeText: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  creditCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  creditCardDanger: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
  },
  creditTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },
  creditRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  creditLabel: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  creditValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  creditWarn: {
    marginTop: 6,
    fontSize: theme.type.bodySmall,
    color: theme.colors.danger,
    fontWeight: "600",
  },
  creditHint: {
    marginTop: 2,
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
});
