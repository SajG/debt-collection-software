import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { theme } from "@/theme";

// Horizontal group of mutually exclusive buttons. Used for short
// pick lists (quantity unit, filter chips). Two sizes:
//   default — full 56px tap target, body-size label. Use inside
//             the item sheet where the tap is the whole action.
//   compact — 32px tall, small label. Use for secondary filters
//             on list screens (staff + factory home), which sit
//             next to the actual data and should not eat vertical
//             space themselves.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: readonly { label: string; value: T }[];
  value: T | null;
  onChange: (v: T) => void;
  compact?: boolean;
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
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: active }}
            hitSlop={compact ? { top: 4, bottom: 4 } : undefined}
            style={({ pressed }) => [
              compact ? styles.optCompact : styles.opt,
              active && styles.active,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                compact ? styles.labelCompact : styles.label,
                active && styles.activeLabel,
              ]}
              numberOfLines={1}
            >
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
  optCompact: {
    // 40dp visual + hitSlop below = 48dp touch area.
    minHeight: 40,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
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
  labelCompact: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },
  activeLabel: { color: theme.colors.primaryOn },
});
