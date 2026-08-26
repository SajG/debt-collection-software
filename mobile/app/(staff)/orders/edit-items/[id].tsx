import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ItemSheet } from "@/components/ItemSheet";
import { supabase } from "@/lib/supabase";
import { formatINR } from "@/lib/format";
import type { QuantityUnit } from "@/lib/database.types";
import type { OrderDraftItem } from "@/lib/order-draft";
import { theme } from "@/theme";

// Edit line items on any pre-dispatch order.
// Delegates the atomic replace to the SECURITY DEFINER RPC
// `replace_sales_order_items` (migration 20260826150000). The RPC
// enforces the same status gate as the header edit — no need to mirror
// it here beyond the initial load check.

type Draft = Omit<OrderDraftItem, "localId">;

type SheetState =
  | { mode: "add" }
  | { mode: "edit"; localId: string }
  | null;

function newLocalId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function lineTotal(it: OrderDraftItem): number {
  const q = Number(it.quantity) || 0;
  const r = Number(it.productRate.replace(/[₹,\s]/g, "")) || 0;
  return Math.round(q * r * 100) / 100;
}

function emptyDraftItem(sticky: {
  brand: string | null;
  packing: string | null;
  size: string | null;
  unit: QuantityUnit;
}): Draft {
  return {
    brand: sticky.brand,
    productId: null,
    productName: null,
    customProductName: null,
    quantity: "",
    quantityUnit: sticky.unit,
    packingType: sticky.packing,
    sizeKg: sticky.size,
    productRate: "",
  };
}

export default function EditItemsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [items, setItems] = useState<OrderDraftItem[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("SalesOrder")
        .select(
          `id, orderNumber, currentStatus,
           items:SalesOrderItem!SalesOrderItem_salesOrderId_fkey(
             lineNumber, productId, brand, quantity, quantityUnit,
             packingType, sizeKg, productRate,
             product:Product!SalesOrderItem_productId_fkey(name)
           )`,
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        Alert.alert("Could not load", error?.message ?? "Order not found.");
        router.back();
        return;
      }
      type Row = {
        orderNumber: string;
        currentStatus: string;
        items: {
          lineNumber: number;
          productId: string;
          brand: string;
          quantity: number | string;
          quantityUnit: string;
          packingType: string | null;
          sizeKg: string | null;
          productRate: string;
          product: { name: string } | null;
        }[];
      };
      const row = data as unknown as Row;
      setOrderNumber(row.orderNumber);
      setStatus(row.currentStatus);
      const sorted = [...(row.items ?? [])].sort(
        (a, b) => a.lineNumber - b.lineNumber,
      );
      setItems(
        sorted.map((it) => ({
          localId: newLocalId(),
          brand: it.brand,
          productId: it.productId,
          productName: it.product?.name ?? null,
          customProductName: null,
          quantity: String(it.quantity),
          quantityUnit: (it.quantityUnit as QuantityUnit) ?? "KG",
          packingType: it.packingType,
          sizeKg: it.sizeKg,
          productRate: it.productRate,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canSave = items.length > 0 && items.every(isItemComplete);

  const totalValue = useMemo(
    () => items.reduce((sum, it) => sum + lineTotal(it), 0),
    [items],
  );

  const initialForSheet = useMemo<Draft>(() => {
    const sticky = {
      brand: items[items.length - 1]?.brand ?? null,
      packing: items[items.length - 1]?.packingType ?? null,
      size: items[items.length - 1]?.sizeKg ?? null,
      unit: items[items.length - 1]?.quantityUnit ?? ("KG" as QuantityUnit),
    };
    if (!sheet) return emptyDraftItem(sticky);
    if (sheet.mode === "add") return emptyDraftItem(sticky);
    const found = items.find((x) => x.localId === sheet.localId);
    if (!found) return emptyDraftItem(sticky);
    const { localId: _drop, ...rest } = found;
    return rest;
  }, [sheet, items]);

  async function save() {
    if (!id) return;
    if (!canSave) {
      Alert.alert("Incomplete lines", "Every line needs a product, quantity, and rate.");
      return;
    }
    setSaving(true);
    const payload = items.map((it) => ({
      productId: it.productId ?? undefined,
      newProductName: it.productId ? undefined : it.customProductName ?? undefined,
      brand: it.brand ?? "",
      quantity: it.quantity,
      quantityUnit: it.quantityUnit,
      packingType: it.packingType ?? undefined,
      sizeKg: it.sizeKg ?? undefined,
      productRate: it.productRate,
    }));
    const { error } = await supabase.rpc("replace_sales_order_items", {
      p_order_id: id,
      p_items: payload,
    });
    setSaving(false);
    if (error) {
      Alert.alert("Could not save", error.message);
      return;
    }
    Alert.alert("Saved", "Items updated.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  }

  if (loading) {
    return (
      <Screen back backTitle="Edit items">
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  const terminal =
    status &&
    ["DISPATCHED", "PARTIALLY_DISPATCHED", "DELIVERED", "CANCELLED", "REJECTED"].includes(
      status,
    );

  if (terminal) {
    return (
      <Screen back backTitle={orderNumber ?? "Edit items"}>
        <View style={styles.center}>
          <Text style={styles.title}>Cannot edit items</Text>
          <Text style={styles.subtitle}>
            This order is {status}. Item edits are only allowed before dispatch.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen back backTitle={orderNumber ?? "Edit items"} padded={false}>
      <FlatList
        contentContainerStyle={styles.body}
        data={items}
        keyExtractor={(it) => it.localId}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No items. Tap "Add item" to add a line.
          </Text>
        }
        renderItem={({ item }) => (
          <Swipeable
            renderRightActions={() => (
              <Pressable
                onPress={() =>
                  setItems((prev) => prev.filter((x) => x.localId !== item.localId))
                }
                style={styles.deleteAction}
                accessibilityRole="button"
                accessibilityLabel="Remove line"
              >
                <Text style={styles.deleteActionText}>Delete</Text>
              </Pressable>
            )}
          >
            <Pressable
              onPress={() => setSheet({ mode: "edit", localId: item.localId })}
              style={({ pressed }) => [
                styles.itemRow,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Edit line"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemBrand}>{item.brand ?? "—"}</Text>
                <Text style={styles.itemName}>
                  {item.productName ?? item.customProductName ?? "New product"}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.quantity || "0"} {item.quantityUnit}
                  {item.packingType ? ` · ${item.packingType}` : ""}
                  {item.sizeKg ? ` · ${item.sizeKg} kg` : ""}
                  {" · @"}
                  {item.productRate || "0"}
                </Text>
              </View>
              <Text style={styles.itemValue}>{formatINR(lineTotal(item))}</Text>
            </Pressable>
          </Swipeable>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Order total</Text>
          <Text style={styles.totalValue}>{formatINR(totalValue)}</Text>
        </View>
        <View style={styles.footerButtons}>
          <Button
            label="+ Add item"
            variant="secondary"
            onPress={() => setSheet({ mode: "add" })}
          />
          <Button
            label={saving ? "Saving…" : "Save changes"}
            disabled={saving || !canSave}
            loading={saving}
            onPress={save}
          />
        </View>
      </View>

      <ItemSheet
        visible={sheet !== null}
        mode={sheet?.mode === "edit" ? "edit" : "add"}
        initial={initialForSheet}
        onCancel={() => setSheet(null)}
        onDelete={
          sheet?.mode === "edit"
            ? () => {
                if (sheet.mode !== "edit") return;
                const target = sheet.localId;
                setItems((prev) => prev.filter((x) => x.localId !== target));
                setSheet(null);
              }
            : undefined
        }
        onSave={(next) => {
          if (sheet?.mode === "edit") {
            const target = sheet.localId;
            setItems((prev) =>
              prev.map((x) => (x.localId === target ? { ...next, localId: x.localId } : x)),
            );
          } else {
            setItems((prev) => [...prev, { ...next, localId: newLocalId() }]);
          }
          setSheet(null);
        }}
      />
    </Screen>
  );
}

function isItemComplete(it: OrderDraftItem): boolean {
  const hasProduct = Boolean(it.productId) || Boolean(it.customProductName?.trim());
  const hasQty = Number(it.quantity) > 0;
  const hasRate = Number(it.productRate.replace(/[₹,\s]/g, "")) > 0;
  return hasProduct && hasQty && hasRate;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  body: { padding: theme.spacing.lg, gap: theme.spacing.sm, paddingBottom: 180 },
  empty: {
    marginTop: theme.spacing.xl,
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
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
  itemBrand: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemName: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 2,
  },
  itemMeta: {
    marginTop: 4,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  itemValue: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  deleteAction: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius,
    marginLeft: 8,
  },
  deleteActionText: { color: "#fff", fontWeight: "700" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.sm,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  totalLabel: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  totalValue: {
    fontSize: theme.type.title,
    fontWeight: "800",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  footerButtons: { flexDirection: "row", gap: 12 },
});
