import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { PickList } from "@/components/PickList";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useProducts } from "@/lib/queries";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Products may come from the Tally BOM (via useProducts) OR the
// salesperson can type a custom name when Tally isn't linked / the
// product isn't in the ledger. Custom names flow to the server as
// p_new_product_name (see create_sales_order RPC).
export default function StepProduct() {
  const { draft, patch } = useWizard();
  const { data, loading } = useProducts();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"catalogue" | "custom">(
    draft.customProductName ? "custom" : "catalogue",
  );

  const products = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .map((p) => ({ label: p.name, value: p.id }));
  }, [data, search]);

  function pickFromCatalogue(id: string) {
    const p = data?.find((x) => x.id === id);
    if (!p) return;
    patch({
      productId: id,
      productName: p.name,
      customProductName: null,
    });
  }

  function goNext() {
    router.push("/(staff)/orders/new/quantity");
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={4} title={t("wizard.product.title")} />
      </View>

      <View style={styles.modeRow}>
        <ModeChip
          label="From catalogue"
          active={mode === "catalogue"}
          onPress={() => setMode("catalogue")}
        />
        <ModeChip
          label="Type custom"
          active={mode === "custom"}
          onPress={() => setMode("custom")}
        />
      </View>

      {mode === "catalogue" ? (
        loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          >
            <TextField
              label="Search product"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {products.length === 0 ? (
              <Text style={styles.empty}>
                {(data ?? []).length === 0
                  ? 'No products in catalogue. Tap "Type custom" to enter one manually.'
                  : `No products match "${search}".`}
              </Text>
            ) : (
              <PickList
                options={products}
                value={draft.productId}
                onChange={pickFromCatalogue}
              />
            )}
          </ScrollView>
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.hint}>
            Type the product name exactly as you want it on the order. It
            doesn't need to match Tally — factory + admin can reconcile
            later.
          </Text>
          <TextField
            label="Product name"
            value={draft.customProductName ?? ""}
            onChangeText={(v) =>
              patch({
                productId: null,
                productName: v,
                customProductName: v,
              })
            }
            autoCapitalize="words"
          />
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Button label={t("wizard.next")} onPress={goNext} />
      </View>
    </Screen>
  );
}

function ModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  chip: {
    flex: 1,
    minHeight: theme.tap,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: "#EAF2EF",
  },
  chipText: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  chipTextActive: { color: theme.colors.primary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: theme.spacing.lg, gap: theme.spacing.md },
  hint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  empty: {
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xl,
  },
  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
