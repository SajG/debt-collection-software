import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "@/theme";

/**
 * Floating action button anchored bottom-right. One per screen — brief
 * only calls for a "New order" FAB on home.
 */
export function FAB({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.plus}>＋</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: theme.spacing.lg,
    bottom: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: theme.tap + 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: { opacity: 0.85 },
  plus: {
    color: theme.colors.primaryOn,
    fontSize: 26,
    lineHeight: 26,
    fontWeight: "700",
  },
  label: {
    color: theme.colors.primaryOn,
    fontSize: theme.type.button,
    fontWeight: "700",
  },
});
