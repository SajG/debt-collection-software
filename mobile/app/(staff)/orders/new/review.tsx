import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { toast } from "@/components/Toast";
import { dismissPushPrompt, enablePush, getPushPromptState } from "@/lib/notifications";
import { useAuth } from "@/auth/AuthContext";

import { Button } from "@/components/Button";
import { confirm } from "@/components/Confirm";
import {
  draftBreakdown,
  isDraftComplete,
  useWizard,
  type OrderDraftItem,
} from "@/lib/order-draft";
import { TextField } from "@/components/TextField";
import { useConnectivity } from "@/lib/connectivity";
import {
  enqueue,
  type OrderRpcHeader,
  type OrderRpcItem,
  type OrderRpcPayload,
} from "@/lib/order-queue";
import { supabase } from "@/lib/supabase";
import { usePartyCredit } from "@/lib/stock-queries";
import { useProducts } from "@/lib/queries";
import { recordLastUsed } from "@/lib/last-used";
import { formatDate, formatINR } from "@/lib/format";
import { humaniseError, isRetryableRpcError } from "@/lib/errors";
import { successHaptic, warningHaptic, errorHaptic } from "@/lib/haptics";
import { theme } from "@/theme";
import { t, tn } from "@/lib/i18n";
import { paymentTermLabel, transportLabel } from "@/lib/labels";
import { pingMilestones } from "@/lib/analytics";

// Screen 3: review + place. Every gate that the server enforces
// (credit-limit, per-line floor rate) is checked client-side and
// surfaced HERE, so a below-floor rate or over-limit total is a
// warning the salesperson sees BEFORE they tap "Place order" — not a
// post-submit error.

function parseRate(raw: string): number {
  const m = raw.replace(/[₹,\s]/g, "").match(/-?[\d.]+/);
  return m ? Number(m[0]) : 0;
}

const DISCOUNT_CHIPS = ["0", "2", "3"] as const;

export default function ScreenReview() {
  const { draft, discard, setField } = useWizard();
  const { profile } = useAuth();
  const { online } = useConnectivity();
  const [submitting, setSubmitting] = useState(false);
  const { data: credit } = usePartyCredit(draft.partyId ?? null);
  // Product floor rates for the below-floor warning. We already load
  // Products for the item sheet — this reuses the same cached fetch.
  const { data: products } = useProducts();
  const productMap = useMemo(() => {
    const m = new Map<string, { floorRate: number | null }>();
    for (const p of products ?? []) {
      m.set(p.id, {
        floorRate:
          (p as { floorRate?: number | string | null }).floorRate == null
            ? null
            : Number((p as { floorRate: number | string }).floorRate),
      });
    }
    return m;
  }, [products]);

  const breakdown = useMemo(() => draftBreakdown(draft), [draft]);
  const total = breakdown.grandTotal;
  const projected = (credit?.totalOutstanding ?? 0) + total;
  const overLimit =
    credit?.creditLimit != null && projected > credit.creditLimit;

  const belowFloorLines = useMemo(() => {
    const hits: { line: number; product: string; floor: number; rate: number }[] =
      [];
    draft.items.forEach((it, i) => {
      if (!it.productId) return;
      const floor = productMap.get(it.productId)?.floorRate;
      const rate = parseRate(it.productRate);
      if (floor != null && rate > 0 && rate < floor) {
        hits.push({
          line: i + 1,
          product: it.productName ?? "",
          floor,
          rate,
        });
      }
    });
    return hits;
  }, [draft.items, productMap]);

  const complete = isDraftComplete(draft);

  async function submit() {
    if (!complete) {
      Alert.alert(t("common.order"), t("staffOrdersNewReview.someFieldsAreStillEmpty"));
      return;
    }
    setSubmitting(true);

    const header: OrderRpcHeader = {
      partyId: draft.partyId,
      newCustomerName: draft.newCustomerName,
      dispatchLocation: draft.dispatchLocation.trim() || null,
      paymentTerm: draft.paymentTerm!,
      transportType: draft.transportType!,
      expectedDeliveryDate: draft.expectedDeliveryDate,
      tokenType: draft.tokenType,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
      creditOverrideNote: null,
      discountPct: breakdown.discountPct,
      gstPct: breakdown.gstPct,
    };
    const items: OrderRpcItem[] = draft.items.map((it) => ({
      productId: it.productId,
      newProductName: it.productId
        ? null
        : it.customProductName?.trim() || null,
      brand: it.brand ?? "",
      quantity: Number(it.quantity),
      quantityUnit: it.quantityUnit,
      packingType: it.packingType!,
      sizeKg: it.sizeKg!,
      productRate: it.productRate.trim(),
    }));
    const payload: OrderRpcPayload = { header, items };

    const firstItem = draft.items[0];
    const display = {
      partyName: draft.partyName ?? draft.newCustomerName ?? "",
      productName:
        firstItem?.productName ?? firstItem?.customProductName ?? "",
      brand: firstItem?.brand ?? null,
      itemCount: draft.items.length,
      totalQuantity: draft.items.reduce(
        (s, it) => s + (Number(it.quantity) || 0),
        0,
      ),
      quantityUnit: firstItem?.quantityUnit ?? "KG",
      currentStatus: "ORDER_PLACED" as const,
    };

    // Record last-used for prefill on the next order to this customer.
    await recordLastUsed(draft.partyId, {
      dispatchLocation: draft.dispatchLocation.trim(),
      paymentTerm: draft.paymentTerm ?? undefined,
      transportType: draft.transportType ?? undefined,
      tokenType: draft.tokenType ?? undefined,
    });

    if (!online) {
      await enqueue(payload, display);
      warningHaptic();
      await finishOffline();
      return;
    }

    try {
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>)(
        "create_sales_order_v2",
        { p_header: header, p_items: items },
      );
      if (error) throw new Error(error.message);
      await finishOnline();
    } catch (e) {
      // Only truly retryable failures (network drop, timeout) go into
      // the offline queue. Everything else — missing RPC, permission
      // denied, credit exceeded, validation — is shown to the
      // salesperson NOW so they know it wasn't accepted. Silent
      // queuing on an app-shape error is how you get a chip that says
      // "waiting to sync" while the DB is missing the function
      // entirely.
      if (isRetryableRpcError(e)) {
        await enqueue(payload, display);
        warningHaptic();
        await finishOffline();
      } else {
        errorHaptic();
        const hum = humaniseError(e, { action: "place-order" });
        Alert.alert(t("staffOrdersNewReview.orderNotPlaced"), hum.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function finishOnline() {
    await discard();
    toast.success(t("staffOrdersNewReview.orderPlaced"));
    pingMilestones();
    router.replace("/(staff)/orders");
    void offerPushAfterFirstOrder();
  }
  async function finishOffline(reason?: string) {
    await discard();
    // Stays an alert: the reason can be long and must be read.
    Alert.alert(
      t("common.savedOnYourPhone"),
      reason ??
        t("staffOrdersNewReview.theOrderWillBeSent"),
    );
    router.replace("/(staff)/orders");
  }

  // The notification permission is asked here — right after an order
  // is placed, when "tell me when it is dispatched" makes sense — with
  // our one-line reason first. The OS dialog only follows "Turn on".
  async function offerPushAfterFirstOrder() {
    if (!profile) return;
    if ((await getPushPromptState()) !== "ask") return;
    Alert.alert(t("push.reason"), undefined, [
      {
        text: t("common.notNow"),
        style: "cancel",
        onPress: () => void dismissPushPrompt(),
      },
      {
        text: t("push.turnOn"),
        onPress: () => {
          void enablePush(profile.id).then((ok) => {
            if (ok) toast.success(t("push.enabled"));
          });
        },
      },
    ]);
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={3} title={t("staffOrdersNewReview.reviewPlace")} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Warnings BEFORE the submit — never a post-submit surprise. */}
        {overLimit && (
          <View style={[styles.warn, styles.warnDanger]}>
            <Text style={styles.warnTitle}>{t("staffOrdersNewReview.overCreditLimit")}</Text>
            <Text style={styles.warnBody}>
              {t("staffOrdersNewReview.overLimitBody", {
                outstanding: formatINR(credit?.totalOutstanding ?? 0),
                order: formatINR(total),
                projected: formatINR(projected),
                limit: formatINR(credit?.creditLimit ?? 0),
              })}
            </Text>
          </View>
        )}
        {belowFloorLines.length > 0 && (
          <View style={[styles.warn, styles.warnAmber]}>
            <Text style={styles.warnTitle}>
              {belowFloorLines.length === 1
                ? t("staffOrdersNewReview.1LineBelowFloorRate")
                : t("staffOrdersNewReview.linesBelowFloorRate", { count: belowFloorLines.length })}
            </Text>
            {belowFloorLines.map((h) => (
              <Text key={h.line} style={styles.warnBody}>
                {t("staffOrdersNewReview.belowFloorLine", {
                  line: h.line,
                  product: h.product,
                  rate: formatINR(h.rate),
                  floor: formatINR(h.floor),
                })}
              </Text>
            ))}
          </View>
        )}

        <SummaryRow
          label={t("common.customer")}
          value={draft.partyName ?? draft.newCustomerName ?? "—"}
        />
        <SummaryRow label={t("staffOrdersNewReview.dispatchTo")} value={draft.dispatchLocation} />
        <SummaryRow
          label={t("common.delivery")}
          value={formatDate(draft.expectedDeliveryDate)}
        />
        <SummaryRow
          label={t("staffOrdersNewReview.payment")}
          value={paymentTermLabel(draft.paymentTerm)}
        />
        <SummaryRow
          label={t("common.transport")}
          value={transportLabel(draft.transportType)}
        />
        <SummaryRow label={t("staffOrdersNewReview.token")} value={draft.tokenType ?? "—"} />
        {draft.notes.trim() ? (
          <SummaryRow label={t("common.notes")} value={draft.notes} />
        ) : null}

        <Text style={styles.itemsHeader}>
          {tn("staffOrdersNewReview.itemsHeader", draft.items.length)}
        </Text>
        {draft.items.map((it, i) => (
          <ItemRow key={it.localId} item={it} idx={i + 1} />
        ))}

        <Text style={styles.itemsHeader}>{t("staffOrdersNewReview.cashDiscount")}</Text>
        <View style={styles.chipRow}>
          {DISCOUNT_CHIPS.map((c) => {
            const active =
              (draft.discountPct || "0") === c ||
              (c === "0" && !draft.discountPct);
            return (
              <Pressable
                accessibilityLabel={c}
                key={c}
                onPress={() => setField("discountPct", c === "0" ? "" : c)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    active && styles.chipLabelActive,
                  ]}
                >
                  {c}%
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextField
          label={t("staffOrdersNewReview.customDiscountOptional")}
          placeholder="e.g. 1.5"
          keyboardType="numeric"
          value={
            draft.discountPct &&
            !DISCOUNT_CHIPS.includes(
              draft.discountPct as (typeof DISCOUNT_CHIPS)[number],
            )
              ? draft.discountPct
              : ""
          }
          onChangeText={(v) => setField("discountPct", v.trim())}
        />

        <View style={styles.breakdown}>
          <BreakdownRow label={t("staffOrdersNewReview.subtotal")} value={formatINR(breakdown.subtotal)} />
          {breakdown.discountAmount > 0 ? (
            <BreakdownRow
              label={t("staffOrdersNewReview.cashDiscount2", { discountPct: breakdown.discountPct })}
              value={`− ${formatINR(breakdown.discountAmount)}`}
              muted
            />
          ) : null}
          {breakdown.discountAmount > 0 ? (
            <BreakdownRow
              label={t("staffOrdersNewReview.taxableAmount")}
              value={formatINR(breakdown.taxable)}
            />
          ) : null}
          <BreakdownRow
            label={`GST (${breakdown.gstPct}%)`}
            value={formatINR(breakdown.gstAmount)}
          />
          <View style={styles.breakdownDivider} />
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>{t("staffOrdersNewReview.grandTotal")}</Text>
            <Text style={styles.grandTotalValue}>{formatINR(total)}</Text>
          </View>
        </View>

        <View style={{ height: theme.spacing.md }} />

        <Button
          label={submitting ? t("staffOrdersNewReview.placing") : t("staffOrdersNewReview.placeOrder")}
          loading={submitting}
          disabled={!complete || submitting}
          onPress={() =>
            confirm({
              title: t("staffOrdersNewReview.placeOrder2"),
              body:
                overLimit || belowFloorLines.length > 0
                  ? t("staffOrdersNewReview.theOrderWillGoTo")
                  : t("staffOrdersNewReview.theFactoryWillSeeIt"),
              confirmLabel: t("staffOrdersNewReview.placeOrder"),
              onConfirm: submit,
            })
          }
        />
      </ScrollView>
    </Screen>
  );
}

function BreakdownRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, muted && styles.breakdownMuted]}>
        {label}
      </Text>
      <Text style={[styles.breakdownValue, muted && styles.breakdownMuted]}>
        {value}
      </Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function ItemRow({ item, idx }: { item: OrderDraftItem; idx: number }) {
  const total = (Number(item.quantity) || 0) * parseRate(item.productRate);
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemIdx}>{idx}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>
          {item.productName ?? item.customProductName ?? "—"}
        </Text>
        <Text style={styles.itemMeta}>
          {item.brand ?? "—"} · {item.quantity} {item.quantityUnit}
          {item.packingType ? ` · ${item.packingType}` : ""}
          {item.sizeKg ? ` · ${item.sizeKg} kg` : ""} · @{item.productRate}
        </Text>
      </View>
      <Text style={styles.itemValue}>{formatINR(total)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: 10 },
  warn: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    gap: 4,
  },
  warnDanger: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
  },
  warnAmber: {
    borderColor: "#c98a00",
    backgroundColor: "#fff5d6",
  },
  warnTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  warnBody: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
  },
  row: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  rowLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rowValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
    marginTop: 2,
  },
  itemsHeader: {
    marginTop: theme.spacing.md,
    fontSize: 13,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  itemIdx: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.textMuted,
    fontVariant: ["tabular-nums"],
    width: 24,
    textAlign: "center",
  },
  itemName: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  itemMeta: {
    marginTop: 2,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  itemValue: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    minHeight: theme.tap,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "700",
  },
  chipLabelActive: { color: "#fff" },
  breakdown: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownLabel: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
  },
  breakdownValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  breakdownMuted: { color: theme.colors.textMuted },
  breakdownDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  grandTotalLabel: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  grandTotalValue: {
    fontSize: theme.type.title,
    color: theme.colors.text,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
