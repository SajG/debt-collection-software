import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { PickList } from "@/components/PickList";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { COMMON_PACKINGS, COMMON_SIZES_KG } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

const OTHER = "__OTHER__";

// Two pick lists on one step because they're the same concept ("how is
// it packed?"). Free-text escape hatch on both since the Prisma model
// accepts informal values in the wild.
export default function StepPacking() {
  const { draft, setField } = useWizard();

  const packOptions = useMemo(
    () => [
      ...COMMON_PACKINGS.map((p) => ({ label: p, value: p })),
      { label: t("wizard.packing.custom"), value: OTHER },
    ],
    [],
  );
  const sizeOptions = useMemo(
    () => [
      ...COMMON_SIZES_KG.map((s) => ({ label: s + " kg", value: s })),
      { label: t("wizard.packing.custom"), value: OTHER },
    ],
    [],
  );

  const [packMode, setPackMode] = useState<"list" | "custom">(
    draft.packingType && !COMMON_PACKINGS.includes(draft.packingType)
      ? "custom"
      : "list",
  );
  const [sizeMode, setSizeMode] = useState<"list" | "custom">(
    draft.sizeKg && !COMMON_SIZES_KG.includes(draft.sizeKg) ? "custom" : "list",
  );

  const canContinue = Boolean(draft.packingType && draft.sizeKg);

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <WizardHeader step={5} title={t("wizard.packing.title")} />
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>{t("wizard.packing.pack")}</Text>
        <PickList
          options={packOptions}
          value={
            packMode === "custom"
              ? OTHER
              : (draft.packingType as string | null)
          }
          onChange={(v) => {
            if (v === OTHER) {
              setPackMode("custom");
              setField("packingType", "");
            } else {
              setPackMode("list");
              setField("packingType", v);
            }
          }}
        />
        {packMode === "custom" && (
          <TextField
            label={t("wizard.packing.customPack")}
            value={draft.packingType ?? ""}
            onChangeText={(v) => setField("packingType", v)}
            autoCapitalize="none"
          />
        )}

        <Text style={styles.sectionLabel}>{t("wizard.packing.size")}</Text>
        <PickList
          options={sizeOptions}
          value={
            sizeMode === "custom" ? OTHER : (draft.sizeKg as string | null)
          }
          onChange={(v) => {
            if (v === OTHER) {
              setSizeMode("custom");
              setField("sizeKg", "");
            } else {
              setSizeMode("list");
              setField("sizeKg", v);
            }
          }}
        />
        {sizeMode === "custom" && (
          <TextField
            label={t("wizard.packing.customSize")}
            value={draft.sizeKg ?? ""}
            onChangeText={(v) => setField("sizeKg", v)}
            autoCapitalize="none"
          />
        )}

        <Button
          label={t("wizard.next")}
          onPress={() => router.push("/(staff)/orders/new/rate")}
          disabled={!canContinue}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  sectionLabel: {
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
  },
});
