import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function StepDelivery() {
  const { draft, setField, hydrated } = useWizard();
  const [showIosPicker, setShowIosPicker] = useState(false);

  // Default to tomorrow on first entry, only after draft is hydrated so
  // we don't overwrite an already-saved user choice.
  useEffect(() => {
    if (hydrated && !draft.expectedDeliveryDate) {
      setField("expectedDeliveryDate", tomorrowIso());
    }
  }, [hydrated, draft.expectedDeliveryDate, setField]);

  const selectedDate = draft.expectedDeliveryDate
    ? new Date(draft.expectedDeliveryDate)
    : new Date();

  function onChange(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") {
      // Android's Android picker fires once and closes itself.
      if (date) setField("expectedDeliveryDate", date.toISOString().slice(0, 10));
    } else {
      // iOS keeps the picker open; only close if user hit "done".
      if (date) setField("expectedDeliveryDate", date.toISOString().slice(0, 10));
      setShowIosPicker(false);
    }
  }

  function openPicker() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selectedDate,
        mode: "date",
        minimumDate: new Date(),
        onChange,
      });
    } else {
      setShowIosPicker(true);
    }
  }

  return (
    <Screen padded={false} scroll>
      <View style={styles.header}>
        <WizardHeader step={9} title={t("wizard.delivery.title")} />
      </View>

      <View style={styles.body}>
        <Text style={styles.hint}>{t("wizard.delivery.default")}</Text>

        <Pressable
          onPress={openPicker}
          style={({ pressed }) => [styles.dateCard, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.dateValue}>{formatDate(selectedDate)}</Text>
          <Text style={styles.dateChange}>{t("wizard.delivery.pick")}</Text>
        </Pressable>

        {Platform.OS === "ios" && showIosPicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="inline"
            minimumDate={new Date()}
            onChange={onChange}
          />
        )}

        <Button
          label={t("wizard.next")}
          onPress={() => router.push("/(staff)/orders/new/token")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  hint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  dateCard: {
    padding: theme.spacing.lg,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    alignItems: "center",
    gap: 6,
  },
  dateValue: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
  },
  dateChange: {
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.primary,
    textDecorationLine: "underline",
  },
});
