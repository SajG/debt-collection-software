import { useMemo } from "react";
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
import { useProducts } from "@/lib/queries";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function StepBrand() {
  const { draft, patch } = useWizard();
  const { data, loading } = useProducts();

  const brands = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const p of data) if (p.brand) set.add(p.brand);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  function pickAndNext(brand: string) {
    // Changing brand invalidates the previously-picked product.
    patch({
      brand,
      productId: draft.brand === brand ? draft.productId : null,
      productName: draft.brand === brand ? draft.productName : null,
    });
    router.push("/(staff)/orders/new/product");
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={2} title={t("wizard.brand.title")} />
      </View>
      {loading && brands.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {brands.map((b) => {
            const active = draft.brand === b;
            return (
              <Pressable
                key={b}
                onPress={() => pickAndNext(b)}
                style={({ pressed }) => [
                  styles.tile,
                  active && styles.tileActive,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.tileText, active && styles.tileTextActive]}>
                  {b}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: {
    padding: theme.spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    width: "48%",
    minHeight: 96,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  tileActive: {
    borderColor: theme.colors.primary,
    backgroundColor: "#EAF2EF",
  },
  tileText: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  tileTextActive: { color: theme.colors.primary },
});
