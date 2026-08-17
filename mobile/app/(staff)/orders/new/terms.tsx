import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { PickList } from "@/components/PickList";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { PAYMENT_TERMS, TRANSPORT_TYPES } from "@/lib/constants";
import type { PaymentTerm, TransportType } from "@/lib/database.types";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function StepTerms() {
  const { draft, setField } = useWizard();
  const canContinue = Boolean(draft.paymentTerm && draft.transportType);

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <WizardHeader step={8} title={t("wizard.terms.title")} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionLabel}>{t("wizard.terms.payment")}</Text>
        <PickList<PaymentTerm>
          options={PAYMENT_TERMS}
          value={draft.paymentTerm}
          onChange={(v) => setField("paymentTerm", v)}
        />

        <Text style={styles.sectionLabel}>{t("wizard.terms.transport")}</Text>
        <PickList<TransportType>
          options={TRANSPORT_TYPES}
          value={draft.transportType}
          onChange={(v) => setField("transportType", v)}
        />

        <Button
          label={t("wizard.next")}
          onPress={() => router.push("/(staff)/orders/new/delivery")}
          disabled={!canContinue}
        />
      </ScrollView>
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
