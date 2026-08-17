import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useProducts } from "@/lib/queries";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Products are shown regardless of brand — generic materials (PA-*, WR-*,
// PSA-*, etc.) can ship under any brand. Search box narrows the 24-item
// list to keep it usable on small screens.
export default function StepProduct() {
  const { draft, patch } = useWizard();
  const { data, loading } = useProducts();
  const [search, setSearch] = useState("");

  const products = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .map((p) => ({ label: p.name, value: p.id }));
  }, [data, search]);

  function pick(id: string) {
    const p = data?.find((x) => x.id === id);
    if (!p) return;
    patch({ productId: id, productName: p.name });
    router.push("/(staff)/orders/new/quantity");
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={4} title={t("wizard.product.title")} />
      </View>

      {loading && !data ? (
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
                ? "No products in catalogue. Ask an admin to add products."
                : `No products match "${search}".`}
            </Text>
          ) : (
            <PickList
              options={products}
              value={draft.productId}
              onChange={pick}
            />
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: theme.spacing.lg, gap: theme.spacing.md },
  empty: {
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xl,
  },
});
