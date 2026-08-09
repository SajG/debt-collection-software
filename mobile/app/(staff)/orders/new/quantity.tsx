import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { NumberPad } from "@/components/NumberPad";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { QUANTITY_UNITS } from "@/lib/constants";
import type { QuantityUnit } from "@/lib/database.types";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

const UNIT_OPTIONS = QUANTITY_UNITS.map((u) => ({ label: u, value: u }));

export default function StepQuantity() {
  const { draft, setField } = useWizard();
  const [error, setError] = useState<string | null>(null);

  function next() {
    const n = Number(draft.quantity);
    if (!Number.isFinite(n) || n <= 0) {
      setError(t("wizard.quantity.invalid"));
      return;
    }
    router.push("/(staff)/orders/new/packing");
  }

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <WizardHeader step={4} title={t("wizard.quantity.title")} />
      </View>

      <View style={styles.body}>
        <View style={styles.displayWrap}>
          <Text style={styles.displayLabel}>{t("wizard.quantity.enter")}</Text>
          <Text style={styles.display}>{draft.quantity || "0"}</Text>
        </View>

        <NumberPad
          value={draft.quantity}
          onChange={(v) => {
            setField("quantity", v);
            setError(null);
          }}
        />

        <View style={styles.unitWrap}>
          <Text style={styles.unitLabel}>{t("wizard.quantity.unit")}</Text>
          <Segmented<QuantityUnit>
            options={UNIT_OPTIONS}
            value={draft.quantityUnit}
            onChange={(u) => setField("quantityUnit", u)}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label={t("wizard.next")} onPress={next} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  displayWrap: {
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    gap: 4,
  },
  displayLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  display: {
    fontSize: 56,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  unitWrap: { gap: 8 },
  unitLabel: {
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.text,
  },
  error: {
    fontSize: 14,
    color: theme.colors.danger,
    fontWeight: "600",
  },
});
