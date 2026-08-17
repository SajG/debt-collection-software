import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { PickList } from "@/components/PickList";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { TOKEN_TYPES } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

const OTHER = "__OTHER__";

// Google Form Q15: "Token or Gift?" — one of 4 fixed options + Other.
export default function StepToken() {
  const { draft, setField } = useWizard();
  const startsCustom =
    !!draft.tokenType && !TOKEN_TYPES.includes(draft.tokenType);
  const [mode, setMode] = useState<"list" | "custom">(
    startsCustom ? "custom" : "list",
  );

  const options = useMemo(
    () => [
      ...TOKEN_TYPES.map((tk) => ({ label: tk, value: tk })),
      { label: "Other", value: OTHER },
    ],
    [],
  );

  const canContinue = Boolean(draft.tokenType && draft.tokenType.trim());

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={10} title="Token / Gift" />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hint}>
          What goes inside the packaging?
        </Text>
        <PickList
          options={options}
          value={mode === "custom" ? OTHER : (draft.tokenType as string | null)}
          onChange={(v) => {
            if (v === OTHER) {
              setMode("custom");
              setField("tokenType", "");
            } else {
              setMode("list");
              setField("tokenType", v);
            }
          }}
        />
        {mode === "custom" && (
          <TextField
            label="Describe"
            value={draft.tokenType ?? ""}
            onChangeText={(v) => setField("tokenType", v)}
            autoCapitalize="sentences"
          />
        )}
        <Button
          label={t("wizard.next")}
          onPress={() => router.push("/(staff)/orders/new/notes")}
          disabled={!canContinue}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  hint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
});
