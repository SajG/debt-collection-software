import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { confirm } from "@/components/Confirm";

// 3-screen wizard: Customer & delivery → Items → Review. The header
// shows one dot per screen so the salesperson always knows how much
// is left. No linear-step counter — the item cart on screen 2 makes
// "step N of 12" meaningless.

const TOTAL = 3;

export function WizardHeader({
  step,
  title,
  onBack,
}: {
  /** 1-indexed screen number (1..3). */
  step: number;
  title: string;
  onBack?: () => void;
}) {
  function goHome() {
    confirm({
      title: "Go to home?",
      body: "Your draft is saved. You can resume later.",
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
        <View style={styles.dots} accessibilityLabel={`Step ${step} of ${TOTAL}`}>
          {Array.from({ length: TOTAL }).map((_, i) => {
            const idx = i + 1;
            const active = idx === step;
            const done = idx < step;
            return (
              <View
                key={idx}
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  active && styles.dotActive,
                ]}
              />
            );
          })}
        </View>
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
  backGlyph: { fontSize: 28, color: theme.colors.primary, lineHeight: 28 },
  backLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  dots: { flexDirection: "row", gap: 8, alignItems: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotDone: { backgroundColor: theme.colors.primary, opacity: 0.55 },
  dotActive: { width: 22, backgroundColor: theme.colors.primary },
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
  homeGlyph: { fontSize: 22, color: theme.colors.primary, lineHeight: 24 },
  homeLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
});
