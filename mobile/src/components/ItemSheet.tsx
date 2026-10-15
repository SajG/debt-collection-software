import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "./Text";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { SelectField } from "@/components/SelectField";
import { PickerField, type PickerItem } from "@/components/PickerField";
import { useProducts } from "@/lib/queries";
import { getRecent, recordRecent } from "@/lib/recent-picks";
import {
  COMMON_SIZES_KG,
  PRIVATE_LABEL_SENTINEL,
  QUANTITY_UNITS,
} from "@/lib/constants";
import { useOrgCatalog } from "@/lib/catalog";
import { formatINR } from "@/lib/format";
import type { QuantityUnit } from "@/lib/database.types";
import type { OrderDraftItem } from "@/lib/order-draft";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";

// Bottom-sheet item editor. Every field is a labelled dropdown so the
// sheet reads as one clean column — brand, product, packing, size all
// use the same trigger UI. The escape hatches (custom product / custom
// packing / custom size / private-label brand) sit inline as text
// fields shown only when needed.
//
// Two shapes, decided by the company's own catalogue (web → Products):
//   * catalogue form — the company has a brand list (e.g. Synergy):
//     brand, packing and size are required, chips come from ITS lists.
//   * generic form — no brand list: brand is hidden, packing and size
//     are optional free text. Product + quantity + rate is enough, so
//     any business can take orders without set-up.

type Draft = Omit<OrderDraftItem, "localId">;

const ML_SIZES = new Set(["0.5", "0.31", "0.05", "0.018"]);
const CUSTOM_PRODUCT_SENTINEL = "__custom__";

function formatSizeLabel(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (n >= 1) return `${n} kg`;
  if (ML_SIZES.has(v)) return `${Math.round(n * 1000)} ml`;
  return `${Math.round(n * 1000)} g`;
}

export function ItemSheet({
  visible,
  initial,
  mode,
  onCancel,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial: Draft;
  mode: "add" | "edit";
  onCancel: () => void;
  onSave: (item: Draft) => void;
  onDelete?: () => void;
}) {
  const [item, setItem] = useState<Draft>(initial);
  // Private-label state.
  const [privateLabel, setPrivateLabel] = useState(false);
  const [privateLabelName, setPrivateLabelName] = useState("");
  // Custom-product state — user picked "Custom / not in catalogue".
  const [customProduct, setCustomProduct] = useState(false);
  const [recentProductIds, setRecentProductIds] = useState<string[]>([]);
  const products = useProducts();
  const catalog = useOrgCatalog();
  const catalogMode = catalog.configured;

  useEffect(() => {
    if (!visible) return;
    void getRecent("product").then(setRecentProductIds);
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setItem(initial);
      const known = new Set<string>([...catalog.brands]);
      if (initial.brand && !known.has(initial.brand)) {
        setPrivateLabel(true);
        setPrivateLabelName(initial.brand);
      } else {
        setPrivateLabel(false);
        setPrivateLabelName("");
      }
      setCustomProduct(
        Boolean(
          !initial.productId &&
            initial.customProductName &&
            initial.customProductName.trim(),
        ),
      );
    }
    // catalog.brands only matters when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial]);

  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setItem((prev) => ({ ...prev, [k]: v }));

  // Products filtered by brand. Generic rows (brand = "" / null) always
  // pass so nothing gets accidentally hidden.
  const brandProducts = useMemo(() => {
    if (!products.data) return [];
    if (!item.brand) return products.data;
    return products.data.filter((p) => !p.brand || p.brand === item.brand);
  }, [products.data, item.brand]);

  const productItems = useMemo<PickerItem[]>(() => {
    const rows: PickerItem[] = brandProducts.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.code ?? null,
      searchText: `${p.name} ${p.code ?? ""} ${p.brand ?? ""}`,
    }));
    rows.push({
      value: CUSTOM_PRODUCT_SENTINEL,
      label: t("itemSheet.customNotInCatalogue"),
      sublabel: t("itemSheet.typeNameBelow"),
    });
    return rows;
  }, [brandProducts]);

  // Brand dropdown items — chip list + private-label sentinel.
  const brandItems = useMemo<PickerItem[]>(
    () =>
      catalog.brands.map((b) => ({
        value: b,
        label: b,
      })),
    [catalog.brands],
  );

  const brandValue = privateLabel
    ? PRIVATE_LABEL_SENTINEL
    : item.brand;

  const productValue = customProduct ? CUSTOM_PRODUCT_SENTINEL : item.productId;

  const lineTotal = useMemo(() => {
    const q = Number(item.quantity) || 0;
    const r = Number(item.productRate.replace(/[₹,\s]/g, "")) || 0;
    return Math.round(q * r * 100) / 100;
  }, [item.quantity, item.productRate]);

  const hasProduct = Boolean(
    item.productId || (item.customProductName && item.customProductName.trim()),
  );
  const isComplete = Boolean(
    hasProduct &&
      Number(item.quantity) > 0 &&
      item.productRate.trim() &&
      (!catalogMode || (item.brand && item.packingType && item.sizeKg)),
  );

  function onBrandChange(v: string) {
    if (v === PRIVATE_LABEL_SENTINEL) {
      setPrivateLabel(true);
      setField("brand", privateLabelName.trim() || null);
    } else {
      setPrivateLabel(false);
      setPrivateLabelName("");
      setField("brand", v);
    }
  }

  function onProductChange(v: string) {
    if (v === CUSTOM_PRODUCT_SENTINEL) {
      setCustomProduct(true);
      setItem((prev) => ({
        ...prev,
        productId: null,
        productName: null,
      }));
      return;
    }
    const p = brandProducts.find((x) => x.id === v);
    if (!p) return;
    setCustomProduct(false);
    setItem((prev) => ({
      ...prev,
      productId: p.id,
      productName: p.name,
      customProductName: null,
      brand: prev.brand ?? p.brand ?? null,
    }));
    // Fire-and-forget recency record. Failure to persist doesn't
    // block the sheet — the picker still opens on next Add, just
    // without the bump.
    void recordRecent("product", p.id);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {mode === "edit" ? t("itemSheet.editItem") : t("itemSheet.addItem")}
            </Text>
            <Pressable
              onPress={onCancel}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("itemSheet.close")}
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {catalogMode ? (
              <PickerField
                label={t("itemSheet.brand")}
                value={brandValue}
                items={brandItems}
                onChange={onBrandChange}
                placeholder={t("itemSheet.chooseBrand")}
              />
            ) : null}
            {catalogMode && privateLabel ? (
              <TextField
                label={t("itemSheet.privateLabelBrandName")}
                placeholder={t("itemSheet.enterTheBrandTheCustomer")}
                value={privateLabelName}
                onChangeText={(v) => {
                  setPrivateLabelName(v);
                  setField("brand", v.trim() || null);
                }}
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : null}

            <PickerField
              label={t("itemSheet.productGrade")}
              value={productValue}
              items={productItems}
              onChange={onProductChange}
              recentValues={recentProductIds}
              placeholder={
                products.loading && !products.data
                  ? t("itemSheet.loadingProducts")
                  : t("itemSheet.searchByNameOrGrade")
              }
              searchable
              searchPlaceholder={t("itemSheet.searchProducts")}
            />
            {customProduct ? (
              <TextField
                label={t("itemSheet.customProductName")}
                placeholder={t("itemSheet.productNameGradeOrPrivate")}
                value={item.customProductName ?? ""}
                onChangeText={(v) => {
                  setItem((prev) => ({
                    ...prev,
                    customProductName: v,
                    productId: null,
                    productName: null,
                  }));
                }}
              />
            ) : null}

            <TextField
              label={t("itemSheet.quantity")}
              placeholder="0"
              keyboardType="decimal-pad"
              value={item.quantity}
              onChangeText={(v) =>
                setField(
                  "quantity",
                  v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"),
                )
              }
            />
            <Segmented<QuantityUnit>
              options={QUANTITY_UNITS.map((u) => ({ label: u, value: u }))}
              value={item.quantityUnit}
              onChange={(v) => setField("quantityUnit", v)}
            />

            {catalog.packings.length > 0 ? (
              <SelectField
                label={t("itemSheet.packing")}
                value={item.packingType}
                options={catalog.packings}
                onChange={(v) => setField("packingType", v)}
              />
            ) : null}
            <TextField
              label={
                catalog.packings.length > 0
                  ? t("itemSheet.customPackingOptional")
                  : t("itemSheet.packingOptional")
              }
              placeholder={t("itemSheet.eG310MlCartridge")}
              value={
                item.packingType && !catalog.packings.includes(item.packingType)
                  ? item.packingType
                  : ""
              }
              onChangeText={(v) => setField("packingType", v.trim() || null)}
              autoCapitalize="sentences"
              autoCorrect={false}
            />

            {catalogMode ? (
              <SelectField
                label={t("itemSheet.size")}
                value={item.sizeKg}
                options={COMMON_SIZES_KG}
                onChange={(v) => setField("sizeKg", v)}
                formatLabel={formatSizeLabel}
              />
            ) : null}
            <TextField
              label={
                catalogMode
                  ? t("itemSheet.customSizeOptionalKgOr")
                  : t("itemSheet.sizeOptional")
              }
              placeholder='e.g. "310 ml", "0.45 kg"'
              value={
                item.sizeKg && !(catalogMode && COMMON_SIZES_KG.includes(item.sizeKg))
                  ? item.sizeKg
                  : ""
              }
              onChangeText={(v) => setField("sizeKg", v.trim() || null)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />

            <TextField
              label={t("itemSheet.ratePerUnit")}
              placeholder="e.g. 185"
              keyboardType="numeric"
              value={item.productRate}
              onChangeText={(v) => setField("productRate", v)}
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("itemSheet.lineTotal")}</Text>
              <Text style={styles.totalValue}>{formatINR(lineTotal)}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {mode === "edit" && onDelete ? (
              <Button
                label={t("common.delete")}
                variant="danger"
                fullWidth={false}
                onPress={onDelete}
              />
            ) : (
              <View />
            )}
            <Button
              label={mode === "edit" ? t("itemSheet.save") : t("itemSheet.add")}
              disabled={!isComplete}
              onPress={() => onSave(item)}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  closeGlyph: {
    fontSize: 32,
    lineHeight: 32,
    color: theme.colors.textMuted,
    paddingHorizontal: 8,
  },
  body: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    marginTop: 10,
  },
  totalRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
  },
  totalLabel: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  totalValue: {
    fontSize: theme.type.title,
    color: theme.colors.text,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    justifyContent: "space-between",
  },
});
