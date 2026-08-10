import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function StepNotes() {
  const { draft, setField } = useWizard();

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <WizardHeader step={9} title={t("wizard.notes.title")} />
      </View>

      <View style={styles.body}>
        <TextField
          label={t("wizard.notes.label")}
          value={draft.notes}
          onChangeText={(v) => setField("notes", v)}
          multiline
          numberOfLines={5}
          style={styles.textarea}
          maxLength={2000}
        />

        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={t("wizard.notes.skip")}
            onPress={() => {
              setField("notes", "");
              router.push("/(staff)/orders/new/review");
            }}
          />
          <Button
            label={t("wizard.next")}
            onPress={() => router.push("/(staff)/orders/new/review")}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  textarea: {
    minHeight: 140,
    textAlignVertical: "top",
    paddingTop: theme.spacing.md,
  },
  actions: { gap: theme.spacing.sm },
});
