import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { Swipeable } from "react-native-gesture-handler";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { Button } from "@/components/Button";
import { ItemSheet } from "@/components/ItemSheet";
import {
  draftTotal,
  isDraftComplete,
  useWizard,
  type OrderDraftItem,
} from "@/lib/order-draft";
import { formatINR, formatSize } from "@/lib/format";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";

// Screen 2: the item cart. Adding an item opens a bottom sheet (not a
// screen push) so the cart stays visible. Sticky brand/packing/size/unit
// mean the second SKU is one tap away from the first.

type SheetState =
  | { mode: "add" }
  | { mode: "edit"; localId: string }
  | null;

function emptyDraftItem(sticky: {
  brand: string | null;
  packing: string | null;
  size: string | null;
  unit: "KG" | "PCS" | "NOS";
}): Omit<OrderDraftItem, "localId"> {
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

export default function ScreenItems() {
  const { draft, addItem, updateItem, removeItem } = useWizard();
  const [sheet, setSheet] = useState<SheetState>(null);

  const initialForSheet = useMemo<Omit<OrderDraftItem, "localId">>(() => {
    if (!sheet) return emptyDraftItem(sticky(draft));
    if (sheet.mode === "add") return emptyDraftItem(sticky(draft));
    const found = draft.items.find((x) => x.localId === sheet.localId);
    if (!found) return emptyDraftItem(sticky(draft));
    const { localId: _drop, ...rest } = found;
    return rest;
  }, [sheet, draft]);

  const canProceed = isDraftComplete(draft);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={2} title={t("staffOrdersNewItems.items")} />
      </View>

      <FlatList
        contentContainerStyle={styles.body}
        data={draft.items}
        keyExtractor={(it) => it.localId}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {t("staffOrdersNewItems.noItemsYetTapAdd")}
          </Text>
        }
        renderItem={({ item }) => (
          <Swipeable
            renderRightActions={() => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.delete")}
                onPress={() => removeItem(item.localId)}
                style={styles.deleteAction}
              >
                <Text style={styles.deleteActionText}>{t("common.delete")}</Text>
              </Pressable>
            )}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.brand ?? "—"}
              onPress={() => setSheet({ mode: "edit", localId: item.localId })}
              style={({ pressed }) => [
                styles.itemRow,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemBrand}>
                  {item.brand ?? "—"}
                </Text>
                <Text style={styles.itemName}>
                  {item.productName ?? item.customProductName ?? t("common.newProduct")}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.quantity || "0"} {item.quantityUnit}
                  {item.packingType ? ` · ${item.packingType}` : ""}
                  {item.sizeKg ? ` · ${formatSize(item.sizeKg)}` : ""}
                  {" · @"}
                  {item.productRate || "0"}
                </Text>
              </View>
              <Text style={styles.itemValue}>
                {formatINR(lineTotal(item))}
              </Text>
            </Pressable>
          </Swipeable>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t("common.orderTotal")}</Text>
          <Text style={styles.totalValue}>{formatINR(draftTotal(draft))}</Text>
        </View>
        <View style={styles.footerButtons}>
          <Button
            label={t("common.addItem")}
            variant="secondary"
            onPress={() => setSheet({ mode: "add" })}
          />
          <Button
            label={t("staffOrdersNewItems.review")}
            disabled={!canProceed}
            onPress={() => router.push("/(staff)/orders/new/review")}
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
                removeItem(sheet.localId);
                setSheet(null);
              }
            : undefined
        }
        onSave={(next) => {
          if (sheet?.mode === "edit") {
            updateItem(sheet.localId, next);
          } else {
            addItem(next);
          }
          setSheet(null);
        }}
      />
    </Screen>
  );
}

function sticky(draft: ReturnType<typeof useWizard>["draft"]) {
  return {
    brand: draft.stickyBrand,
    packing: draft.stickyPacking,
    size: draft.stickySize,
    unit: draft.stickyUnit,
  };
}

function lineTotal(it: OrderDraftItem): number {
  const q = Number(it.quantity) || 0;
  const r = Number(it.productRate.replace(/[₹,\s]/g, "")) || 0;
  return Math.round(q * r * 100) / 100;
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    paddingBottom: 160,
  },
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
    fontSize: 13,
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
