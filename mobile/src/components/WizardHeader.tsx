import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { useWizard } from "@/lib/order-draft";
import { confirm } from "@/components/Confirm";

// Standard header for every wizard step: back arrow, Home shortcut,
// progress text, and a slim progress bar. Also records `lastStep` on
// the draft so the home screen can offer "Resume order (step N)".
const TOTAL = 12;

export function WizardHeader({
  step,
  title,
  onBack,
}: {
  step: number;
  title: string;
  onBack?: () => void;
}) {
  const { setField } = useWizard();
  useEffect(() => {
    setField("lastStep", step);
  }, [step, setField]);

  const percent = Math.min(100, (step / TOTAL) * 100);

  function goHome() {
    confirm({
      title: "Go to home?",
      body: "Your draft is saved. You can resume from step " + step + " later.",
      confirmLabel: "Go home",
      onConfirm: () => router.replace("/(staff)"),
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("wizard.back")}
        >
          <Text style={styles.backGlyph}>‹</Text>
          <Text style={styles.backLabel}>{t("wizard.back")}</Text>
        </Pressable>
        <Text style={styles.stepLabel}>
          {t("wizard.step", { n: step, total: TOTAL })}
        </Text>
        <Pressable
          onPress={goHome}
          hitSlop={12}
          style={styles.homeBtn}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          <Text style={styles.homeGlyph}>⌂</Text>
          <Text style={styles.homeLabel}>Home</Text>
        </Pressable>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.tap,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: theme.tap,
    minWidth: theme.tap,
    justifyContent: "center",
    paddingHorizontal: 8,
    marginLeft: -8,
  },
  backGlyph: {
    fontSize: 28,
    color: theme.colors.primary,
    lineHeight: 28,
  },
  backLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  homeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: theme.tap,
    minWidth: theme.tap,
    justifyContent: "center",
    paddingHorizontal: 8,
    marginRight: -8,
  },
  homeGlyph: {
    fontSize: 22,
    color: theme.colors.primary,
    lineHeight: 24,
  },
  homeLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: theme.colors.primary,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
});
