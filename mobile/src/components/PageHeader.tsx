import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { goBackOr, useHardwareBack } from "@/lib/back";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Shared sub-screen header: back arrow, title, optional subtitle,
// optional right-side action. Kept deliberately small so every screen
// looks the same — the "not so professional" feel of the app came
// mostly from each page inventing its own header.
export function PageHeader({
  title,
  subtitle,
  right,
  onBack,
  fallback = "/(staff)",
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  /** Where Back goes when there is no history (deep link, cold start). */
  fallback?: string;
}) {
  // Hardware back mirrors the on-screen arrow: one step, never out of
  // the app from a sub-screen.
  const intercept = useCallback(() => {
    if (!onBack) return false;
    onBack();
    return true;
  }, [onBack]);
  useHardwareBack(fallback, intercept);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={onBack ?? (() => goBackOr(fallback))}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("wizard.back")}
        >
          <Text style={styles.backGlyph}>‹</Text>
          <Text style={styles.backLabel}>{t("wizard.back")}</Text>
        </Pressable>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    gap: 6,
  },
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
  right: { flexDirection: "row", gap: 8 },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
});
