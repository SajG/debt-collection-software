import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

// Horizontal group of large, mutually exclusive buttons. Used for
// short pick lists (quantity unit, filter chips).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.opt,
              active && styles.active,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  opt: {
    minHeight: theme.tap,
    minWidth: 80,
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  active: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  pressed: { opacity: 0.85 },
  label: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  activeLabel: { color: theme.colors.primaryOn },
});
