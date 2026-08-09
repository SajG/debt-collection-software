import { useMemo } from "react";
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
import { useProducts } from "@/lib/queries";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function StepProduct() {
  const { draft, patch } = useWizard();
  const { data, loading } = useProducts();

  const products = useMemo(() => {
    if (!data || !draft.brand) return [];
    return data
      .filter((p) => p.brand === draft.brand)
      .map((p) => ({ label: p.name, value: p.id }));
  }, [data, draft.brand]);

  function pick(id: string) {
    const p = data?.find((x) => x.id === id);
    if (!p) return;
    patch({ productId: id, productName: p.name });
    router.push("/(staff)/orders/new/quantity");
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={3} title={t("wizard.product.title")} />
      </View>

      {!draft.brand ? (
        <Text style={styles.empty}>{t("wizard.product.noBrand")}</Text>
      ) : loading && products.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <PickList options={products} value={draft.productId} onChange={pick} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: theme.spacing.lg },
  empty: {
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xl,
  },
});
