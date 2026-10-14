import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { addDays, format } from "date-fns";
import { Text } from "./Text";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { toast } from "./Toast";
import { recordPromise } from "@/lib/followup-queries";
import { formatDate, formatINR } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// "The customer said they will pay ₹X on <date>." Two inputs, three
// one-tap dates, one Save. Writes a PROMISE_TO_PAY follow-up.

const QUICK_DAYS = [1, 3, 7] as const;

export function PromiseSheet({
  party,
  onClose,
  onSaved,
}: {
  /** null = closed. */
  party: { id: string; name: string; outstanding: number } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(() => addDays(new Date(), 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIosPicker, setShowIosPicker] = useState(false);

  useEffect(() => {
    if (!party) return;
    setAmount(String(Math.round(party.outstanding)));
    setDate(addDays(new Date(), 1));
    setError(null);
    setShowIosPicker(false);
  }, [party]);

  const amountNumber = useMemo(() => {
    const n = Number(amount.replace(/[,\s₹]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);

  function onPicked(_e: DateTimePickerEvent, d?: Date) {
    setShowIosPicker(false);
    if (d) setDate(d);
  }

  function pickDate() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: date,
        mode: "date",
        minimumDate: new Date(),
        onChange: onPicked,
      });
      return;
    }
    setShowIosPicker(true);
  }

  async function save() {
    if (!party) return;
    if (amountNumber <= 0) {
      setError(t("promise.amountInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    const res = await recordPromise({
      partyId: party.id,
      amount: amountNumber,
      promiseDate: format(date, "yyyy-MM-dd"),
    });
    setSaving(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    toast.success(
      t("promise.saved", { amount: formatINR(amountNumber), date: formatDate(date) }),
    );
    onSaved();
    onClose();
  }

  const selectedQuick = QUICK_DAYS.find(
    (d) => format(addDays(new Date(), d), "yyyy-MM-dd") === format(date, "yyyy-MM-dd"),
  );

  return (
    <Modal
      visible={party !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {t("promise.title")}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {party
              ? t("promise.subtitle", {
                  name: party.name,
                  amount: formatINR(party.outstanding),
                })
              : ""}
          </Text>

          <TextField
            label={t("promise.amount")}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
            error={error}
            selectTextOnFocus
          />

          <Text style={styles.fieldLabel}>{t("promise.when")}</Text>
          <View style={styles.chips}>
            {QUICK_DAYS.map((d) => {
              const active = selectedQuick === d;
              const label = d === 1 ? t("promise.tomorrow") : t("promise.inDays", { count: d });
              return (
                <Pressable
                  key={d}
                  onPress={() => setDate(addDays(new Date(), d))}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={pickDate}
              style={({ pressed }) => [
                styles.chip,
                !selectedQuick && styles.chipActive,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: !selectedQuick }}
              accessibilityLabel={t("promise.pickDate")}
            >
              <Text style={[styles.chipText, !selectedQuick && styles.chipTextActive]}>
                {selectedQuick ? t("promise.pickDate") : formatDate(date)}
              </Text>
            </Pressable>
          </View>
          {showIosPicker && Platform.OS === "ios" ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              onChange={onPicked}
            />
          ) : null}

          <Text style={styles.summary}>
            {t("promise.summary", {
              amount: formatINR(amountNumber),
              date: formatDate(date),
            })}
          </Text>

          <Button
            label={t("promise.save")}
            loading={saving}
            disabled={amountNumber <= 0}
            onPress={save}
            accessibilityLabel={t("promise.save")}
          />
          <Button
            label={t("confirm.cancel")}
            variant="secondary"
            onPress={onClose}
            accessibilityLabel={t("confirm.cancel")}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,29,24,0.5)" },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: { fontSize: theme.type.heading, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: theme.type.bodySmall, color: theme.colors.textMuted },
  fieldLabel: {
    fontSize: theme.type.bodySmall,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: -8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  chipText: { fontSize: theme.type.bodySmall, fontWeight: "700", color: theme.colors.text },
  chipTextActive: { color: theme.colors.primaryOn },
  summary: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius,
    padding: theme.spacing.md,
  },
});
