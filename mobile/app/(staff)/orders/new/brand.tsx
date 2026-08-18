import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { BRAND_LIST } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Brand tiles come from a fixed list (mirrors the Google Form). Products
// are independent of brand — generic materials (PA-10, PF-48, etc.) ship
// under any brand's packaging, so picking a brand doesn't filter or
// invalidate the product step.
export default function StepBrand() {
  const { draft, patch } = useWizard();
  const startsCustom =
    !!draft.brand && !BRAND_LIST.includes(draft.brand);
  const [customMode, setCustomMode] = useState(startsCustom);
  const [customValue, setCustomValue] = useState(
    startsCustom ? (draft.brand ?? "") : "",
  );

  function selectBrand(brand: string) {
    patch({ brand });
    router.push("/(staff)/orders/new/product");
  }

  function submitCustom() {
    const v = customValue.trim();
    if (!v) return;
    selectBrand(v);
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={3} title={t("wizard.brand.title")} />
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {BRAND_LIST.map((b) => {
          const active = !customMode && draft.brand === b;
          return (
            <Pressable
              key={b}
              onPress={() => {
                setCustomMode(false);
                selectBrand(b);
              }}
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

        <Pressable
          onPress={() => setCustomMode(true)}
          style={({ pressed }) => [
            styles.tile,
            customMode && styles.tileActive,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
        >
          <Text
            style={[styles.tileText, customMode && styles.tileTextActive]}
          >
            Other
          </Text>
        </Pressable>

        {customMode && (
          <View style={styles.customWrap}>
            <TextField
              label="Enter brand name"
              value={customValue}
              onChangeText={setCustomValue}
              autoCapitalize="words"
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={t("wizard.next")}
          onPress={() => {
            if (customMode && customValue.trim()) submitCustom();
            else router.push("/(staff)/orders/new/product");
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
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
  customWrap: {
    width: "100%",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
