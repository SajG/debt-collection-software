import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

// Non-blocking "restart to update" banner. Sits below the app-bar
// pill; tapping the CTA calls Updates.reloadAsync() and the app
// re-mounts on the new bundle.

export function UpdateBanner({
  visible,
  onRestart,
}: {
  visible: boolean;
  onRestart: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Update available</Text>
        <Text style={styles.body}>Restart to install the latest version.</Text>
      </View>
      <Pressable
        onPress={onRestart}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Restart the app to install the update"
      >
        <Text style={styles.btnLabel}>Restart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.focus,
    backgroundColor: theme.colors.bench,
  },
  title: {
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
  btn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLabel: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
});
