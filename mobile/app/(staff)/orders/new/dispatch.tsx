import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Google Form Q4: "Name or full address of the dispatch location?"
// Free text — may be a sub-dealer godown, a customer site, etc.
export default function StepDispatch() {
  const { draft, setField } = useWizard();

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={2} title="Dispatch to" />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hint}>
          Where should the goods be sent? Name or full address of the dispatch
          location.
        </Text>
        <TextField
          label="Dispatch location"
          value={draft.dispatchLocation}
          onChangeText={(v) => setField("dispatchLocation", v)}
          multiline
          numberOfLines={3}
          autoCapitalize="words"
        />
        <Button
          label={t("wizard.next")}
          onPress={() => router.push("/(staff)/orders/new/brand")}
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
