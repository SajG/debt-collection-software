import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function StepRate() {
  const { draft, setField } = useWizard();
  const canContinue = draft.productRate.trim().length > 0;

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <WizardHeader step={7} title={t("wizard.rate.title")} />
      </View>

      <View style={styles.body}>
        <TextField
          label={t("wizard.rate.title")}
          hint={t("wizard.rate.hint")}
          value={draft.productRate}
          onChangeText={(v) => setField("productRate", v)}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.big}
        />

        <Button
          label={t("wizard.next")}
          onPress={() => router.push("/(staff)/orders/new/terms")}
          disabled={!canContinue}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  big: { fontSize: 24, letterSpacing: 1 },
});
