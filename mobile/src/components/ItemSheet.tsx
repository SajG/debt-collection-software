import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { NumberPad } from "@/components/NumberPad";
import { useProducts } from "@/lib/queries";
import {
  BRAND_LIST,
  COMMON_PACKINGS,
  COMMON_SIZES_KG,
  PRIVATE_LABEL_SENTINEL,
  QUANTITY_UNITS,
} from "@/lib/constants";
import { formatINR } from "@/lib/format";
import type { QuantityUnit } from "@/lib/database.types";
import type { OrderDraftItem } from "@/lib/order-draft";
import { theme } from "@/theme";

// Bottom-sheet item editor. One sheet handles Add and Edit — the caller
// passes an initial item and gets a completed item back on Save. On
// Add, brand/packing/size/unit are pre-filled from wizard "stickies"
// so the second SKU on an order is one tap away from the first.
//
// Deliberately NOT a screen push: the whole point of the rewrite is
// that adding an item does not lose the cart context. Keep this modal
// dense enough to complete in <15 s.

type Draft = Omit<OrderDraftItem, "localId">;

// Render a size string as a human-friendly label without changing the
// wire value. Everything ≥ 1 → "N kg". Sub-1 with 3-digit-gram
// equivalent → "N g" (e.g. "0.45" → "450 g"). The tiny ml-equivalent
// entries the spray / cyanoacrylate SKUs use fall into the < 1 bucket:
//   0.5   -> "500 ml"   (spray bottles are ml, not g)
//   0.31  -> "310 ml"
//   0.05  -> "50 ml"
//   0.018 -> "18 ml"
// The heuristic: if the raw value is a canonical "ml" size the price
// list uses, label it ml; otherwise gram.
const ML_SIZES = new Set(["0.5", "0.31", "0.05", "0.018"]);

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
  const [productSearch, setProductSearch] = useState("");
  // Private-label state. `privateLabel` is true when the salesperson
  // picked the "Private Label / Other" brand chip; `privateLabelName`
  // holds the customer-facing brand they type in. On save we write
  // the typed value into item.brand.
  const [privateLabel, setPrivateLabel] = useState(false);
  const [privateLabelName, setPrivateLabelName] = useState("");
  const products = useProducts();

  // Reset local state whenever the sheet re-opens with new initial data.
  useEffect(() => {
    if (visible) {
      setItem(initial);
      setProductSearch("");
      // If the initial brand doesn't match any known brand chip and
      // isn't null, assume it's a saved private label — pre-fill.
      const known = new Set<string>([...BRAND_LIST]);
      if (initial.brand && !known.has(initial.brand)) {
        setPrivateLabel(true);
        setPrivateLabelName(initial.brand);
      } else {
        setPrivateLabel(false);
        setPrivateLabelName("");
      }
    }
  }, [visible, initial]);

  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setItem((prev) => ({ ...prev, [k]: v }));

  const brandProducts = useMemo(() => {
    if (!products.data) return [];
    let list = products.data;
    // Brand filter — Polygum, Stick-Onn, Polygum Industrial. Generic
    // rows (brand === "" / null) still pass through so nothing gets
    // hidden by accident.
    if (item.brand) {
      list = list.filter((p) => !p.brand || p.brand === item.brand);
    }
    // Name-OR-code prefix search. Typing "WR" surfaces the WR-48 and
    // WR-45 grades; typing "Polygum D" surfaces D3+. Case-insensitive.
    const needle = productSearch.trim().toLowerCase();
    if (needle) {
      list = list.filter((p) => {
        const name = p.name.toLowerCase();
        const code = (p.code ?? "").toLowerCase();
        return name.includes(needle) || code.includes(needle);
      });
    }
    return list;
  }, [products.data, item.brand, productSearch]);

  const lineTotal = useMemo(() => {
    const q = Number(item.quantity) || 0;
    const r = Number(item.productRate.replace(/[₹,\s]/g, "")) || 0;
    return Math.round(q * r * 100) / 100;
  }, [item.quantity, item.productRate]);

  const isComplete = Boolean(
    item.brand &&
      (item.productId || (item.customProductName && item.customProductName.trim())) &&
      Number(item.quantity) > 0 &&
      item.packingType &&
      item.sizeKg &&
      item.productRate.trim(),
  );

  function selectProduct(id: string, name: string, brand: string | null) {
    setItem((prev) => ({
      ...prev,
      productId: id,
      productName: name,
      customProductName: null,
      // If the product has a brand hint and the user hasn't picked one,
      // adopt it. Doesn't override an explicit brand choice.
      brand: prev.brand ?? brand ?? null,
    }));
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
              {mode === "edit" ? "Edit item" : "Add item"}
            </Text>
            <Pressable
              onPress={onCancel}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            <SectionLabel text="Brand" />
            <ChipRow
              values={BRAND_LIST}
              selected={privateLabel ? PRIVATE_LABEL_SENTINEL : item.brand}
              onSelect={(v) => {
                if (v === PRIVATE_LABEL_SENTINEL) {
                  setPrivateLabel(true);
                  setField("brand", privateLabelName || null);
                } else {
                  setPrivateLabel(false);
                  setPrivateLabelName("");
                  setField("brand", v);
                }
              }}
            />
            {privateLabel ? (
              <TextField
                label="Private-label brand name"
                placeholder="Enter the brand the customer sells under"
                value={privateLabelName}
                onChangeText={(v) => {
                  setPrivateLabelName(v);
                  setField("brand", v.trim() || null);
                }}
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : null}

            <SectionLabel text="Product" />
            <TextField
              label="Search by name or grade code"
              placeholder="e.g. Polygum D3+, WR-48, PSA 55"
              value={productSearch}
              onChangeText={setProductSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {products.loading && !products.data ? (
              <Text style={styles.hint}>Loading products…</Text>
            ) : (
              <View style={styles.productList}>
                {brandProducts.slice(0, 40).map((p) => {
                  const active = p.id === item.productId;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => selectProduct(p.id, p.name, p.brand)}
                      style={({ pressed }) => [
                        styles.productChip,
                        active && styles.productChipActive,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.productChipLabel,
                          active && styles.productChipLabelActive,
                        ]}
                      >
                        {p.name}
                      </Text>
                      {p.code ? (
                        <Text
                          style={[
                            styles.productChipCode,
                            active && styles.productChipCodeActive,
                          ]}
                        >
                          {p.code}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
                {brandProducts.length === 0 && !products.loading ? (
                  <Text style={styles.hint}>
                    No product match. Type the name below to save as
                    "new product".
                  </Text>
                ) : null}
                {brandProducts.length > 40 ? (
                  <Text style={styles.hint}>
                    +{brandProducts.length - 40} more — refine search.
                  </Text>
                ) : null}
              </View>
            )}
            <TextField
              label="Product / grade / private label"
              placeholder="Product name, grade, or private-label name"
              hint="Type any product or grade not in the catalogue, or the customer's private-label name. Overrides the catalogue pick."
              value={item.customProductName ?? ""}
              onChangeText={(v) => {
                setItem((prev) => ({
                  ...prev,
                  customProductName: v,
                  productId: v.trim() ? null : prev.productId,
                  productName: v.trim() ? null : prev.productName,
                }));
              }}
            />

            <SectionLabel text="Quantity" />
            <View style={styles.qtyRow}>
              <Text style={styles.qtyValue}>{item.quantity || "0"}</Text>
              <Segmented<QuantityUnit>
                options={QUANTITY_UNITS.map((u) => ({ label: u, value: u }))}
                value={item.quantityUnit}
                onChange={(v) => setField("quantityUnit", v)}
              />
            </View>
            <NumberPad
              value={item.quantity}
              onChange={(v) => setField("quantity", v)}
            />

            <SectionLabel text="Packing" />
            <ChipRow
              values={COMMON_PACKINGS.slice(0, 10)}
              selected={item.packingType}
              onSelect={(v) => setField("packingType", v)}
            />
            <TextField
              label="Custom packing (optional)"
              placeholder='e.g. "310 ml cartridge", "500 ml squeeze bottle"'
              value={
                item.packingType && !COMMON_PACKINGS.includes(item.packingType)
                  ? item.packingType
                  : ""
              }
              onChangeText={(v) => setField("packingType", v.trim() || null)}
              autoCapitalize="sentences"
              autoCorrect={false}
            />

            <SectionLabel text="Size" />
            <ChipRow
              values={COMMON_SIZES_KG}
              selected={item.sizeKg}
              onSelect={(v) => setField("sizeKg", v)}
              formatLabel={formatSizeLabel}
            />
            <TextField
              label="Custom size (optional, kg or ml)"
              placeholder='e.g. "310 ml", "0.45 kg"'
              value={
                item.sizeKg && !COMMON_SIZES_KG.includes(item.sizeKg)
                  ? item.sizeKg
                  : ""
              }
              onChangeText={(v) => setField("sizeKg", v.trim() || null)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />

            <SectionLabel text="Rate" />
            <TextField
              label="Rate per unit"
              placeholder="e.g. 185"
              keyboardType="numeric"
              value={item.productRate}
              onChangeText={(v) => setField("productRate", v)}
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Line total</Text>
              <Text style={styles.totalValue}>{formatINR(lineTotal)}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {mode === "edit" && onDelete ? (
              <Button
                label="Delete"
                variant="danger"
                fullWidth={false}
                onPress={onDelete}
              />
            ) : (
              <View />
            )}
            <Button
              label={mode === "edit" ? "Save" : "Add"}
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

function ChipRow({
  values,
  selected,
  onSelect,
  formatLabel,
}: {
  values: readonly string[];
  selected: string | null;
  onSelect: (v: string) => void;
  /** Optional value -> display string. Wire value stays raw; only the
   *  chip label changes. Used for size chips to render "60 kg" / "450 g"
   *  while keeping "60" / "0.45" on the order. */
  formatLabel?: (v: string) => string;
}) {
  return (
    <View style={styles.chipRow}>
      {values.map((v) => {
        const active = v === selected;
        return (
          <Pressable
            key={v}
            onPress={() => onSelect(v)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text
              style={[styles.chipLabel, active && styles.chipLabelActive]}
              numberOfLines={1}
            >
              {formatLabel ? formatLabel(v) : v}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    marginTop: 10,
  },
  hint: { fontSize: theme.type.bodySmall, color: theme.colors.textMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
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
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
    fontWeight: "600",
  },
  chipLabelActive: { color: "#fff" },
  productList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  productChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    minHeight: theme.tap,
    justifyContent: "center",
  },
  productChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
  },
  productChipLabel: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
  },
  productChipLabelActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  productChipCode: {
    fontSize: 11,
    marginTop: 2,
    color: theme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  productChipCodeActive: {
    color: theme.colors.primary,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  qtyValue: {
    fontSize: 40,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
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
  },
});
