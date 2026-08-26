import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { Button } from "@/components/Button";
import { confirm } from "@/components/Confirm";
import {
  draftTotal,
  isDraftComplete,
  useWizard,
  type OrderDraftItem,
} from "@/lib/order-draft";
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

// Screen 3: review + place. Every gate that the server enforces
// (credit-limit, per-line floor rate) is checked client-side and
// surfaced HERE, so a below-floor rate or over-limit total is a
// warning the salesperson sees BEFORE they tap "Place order" — not a
// post-submit error.

function parseRate(raw: string): number {
  const m = raw.replace(/[₹,\s]/g, "").match(/-?[\d.]+/);
  return m ? Number(m[0]) : 0;
}

export default function ScreenReview() {
  const { draft, discard } = useWizard();
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

  const total = draftTotal(draft);
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
      Alert.alert("Order", "Some fields are still empty.");
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
      successHaptic();
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
        Alert.alert("Order not placed", hum.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function finishOnline() {
    await discard();
    Alert.alert("Order placed", "The factory will see it immediately.");
    router.replace("/(staff)");
  }
  async function finishOffline(reason?: string) {
    await discard();
    Alert.alert(
      "Saved on your phone",
      reason ??
        "The order will be sent automatically when you're back online.",
    );
    router.replace("/(staff)");
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={3} title="Review & place" />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Warnings BEFORE the submit — never a post-submit surprise. */}
        {overLimit && (
          <View style={[styles.warn, styles.warnDanger]}>
            <Text style={styles.warnTitle}>Over credit limit</Text>
            <Text style={styles.warnBody}>
              Outstanding {formatINR(credit?.totalOutstanding ?? 0)} + this
              order {formatINR(total)} = {formatINR(projected)}, which is over
              the {formatINR(credit?.creditLimit ?? 0)} limit. An admin may
              need to approve.
            </Text>
          </View>
        )}
        {belowFloorLines.length > 0 && (
          <View style={[styles.warn, styles.warnAmber]}>
            <Text style={styles.warnTitle}>
              {belowFloorLines.length === 1
                ? "1 line below floor rate"
                : `${belowFloorLines.length} lines below floor rate`}
            </Text>
            {belowFloorLines.map((h) => (
              <Text key={h.line} style={styles.warnBody}>
                Line {h.line} · {h.product}: {formatINR(h.rate)} &lt; floor{" "}
                {formatINR(h.floor)}. Admin approval required before the
                factory sees the order.
              </Text>
            ))}
          </View>
        )}

        <SummaryRow
          label="Customer"
          value={draft.partyName ?? draft.newCustomerName ?? "—"}
        />
        <SummaryRow label="Dispatch to" value={draft.dispatchLocation} />
        <SummaryRow
          label="Delivery"
          value={formatDate(draft.expectedDeliveryDate)}
        />
        <SummaryRow
          label="Payment"
          value={draft.paymentTerm?.replace(/_/g, " ") ?? "—"}
        />
        <SummaryRow
          label="Transport"
          value={draft.transportType?.replace(/_/g, " ") ?? "—"}
        />
        <SummaryRow label="Token" value={draft.tokenType ?? "—"} />
        {draft.notes.trim() ? (
          <SummaryRow label="Notes" value={draft.notes} />
        ) : null}

        <Text style={styles.itemsHeader}>
          Items · {draft.items.length}{" "}
          {draft.items.length === 1 ? "line" : "lines"}
        </Text>
        {draft.items.map((it, i) => (
          <ItemRow key={it.localId} item={it} idx={i + 1} />
        ))}

        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Order total</Text>
          <Text style={styles.grandTotalValue}>{formatINR(total)}</Text>
        </View>

        <View style={{ height: theme.spacing.md }} />

        <Button
          label={submitting ? "Placing…" : "Place order"}
          loading={submitting}
          disabled={!complete || submitting}
          onPress={() =>
            confirm({
              title: "Place order?",
              body:
                overLimit || belowFloorLines.length > 0
                  ? "The order will go to admin approval before the factory sees it."
                  : "The factory will see it immediately.",
              confirmLabel: "Place order",
              onConfirm: submit,
            })
          }
        />
      </ScrollView>
    </Screen>
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
    fontSize: 12,
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
    fontSize: 12,
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
  grandTotalRow: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
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
